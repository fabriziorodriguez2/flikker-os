import { Inject, Injectable, Logger } from '@nestjs/common';
import { RetentionExperimentMetricsService } from '../retention-v2/retention-experiment-metrics.service';
import { AiGateService } from './ai-gate.service';
import { AiUsageService } from './ai-usage.service';
import {
  AI_PROVIDER,
  AiProviderError,
  type AiProvider,
} from './ai-provider.interface';
import { AI_USE_CASES } from './ai-usecases';
import { RECOMMENDATION_EXPLANATION_PROMPT_VERSION } from './prompt-versions';
import type { CopySource } from './retention-ai-copy.service';

export interface RecommendationExplanation {
  headline: string;
  explanation: string;
  copySource: CopySource;
}

const SCHEMA = {
  name: 'recommendation_explanation',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      headline: { type: 'string' },
      explanation: { type: 'string' },
    },
    required: ['headline', 'explanation'],
  },
};

const SYSTEM_PROMPT = `Explicás en español, para el dueño de un negocio, por qué el motor de experimentos de Flikker llegó a una conclusión sobre un experimento de retención.
Reglas estrictas:
- Los datos que recibís ("facts") son inmutables y ya fueron calculados por el motor determinístico. Nunca los cambies, nunca inventes cifras que no estén ahí.
- "recommendedVariantName" ya es la conclusión final. Tu explicación DEBE ser consistente con ella — nunca sugieras ni recomiendes una variante distinta.
- No repitas números exactos en el texto si podés evitarlo (la interfaz ya los muestra aparte) — preferí lenguaje cualitativo ("mejor valor económico", "retorno similar").
- Nunca inventes una cifra que no esté en "facts".
- Tono profesional, breve, sin jerga técnica de estadística.
- Devolvé únicamente el JSON pedido: un headline corto y una explicación de 1-2 frases.`;

/**
 * Fase F §20-22 — explains an ALREADY-COMPUTED `ExperimentResults.winner`
 * (Fase D's deterministic `determineWinner`). Never recomputes, never
 * creates a new recommendation — this only writes prose about one that
 * already exists, and the prose is validated against that exact
 * recommendation before it is ever returned.
 */
@Injectable()
export class AiRecommendationExplanationService {
  private readonly logger = new Logger(AiRecommendationExplanationService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    private readonly gate: AiGateService,
    private readonly usage: AiUsageService,
    private readonly metrics: RetentionExperimentMetricsService,
  ) {}

  /** Null when AI is not enabled/allowed — callers show the numbers with no explanation prose, never nothing. */
  async explain(
    businessId: string,
    experimentId: string,
  ): Promise<RecommendationExplanation | null> {
    const results = await this.metrics.forExperiment(businessId, experimentId);

    const gateDecision = await this.gate.check(
      businessId,
      AI_USE_CASES.RECOMMENDATION_EXPLANATION,
    );
    if (!gateDecision.allowed) return null;

    const winner = results.winner;
    const winnerVariant =
      winner.kind === 'NO_CONCLUSION'
        ? null
        : (results.variants.find((v) => v.variantId === winner.variantId) ??
          null);

    const facts = {
      experimentName: results.experimentName,
      recommendation: winner.kind,
      recommendedVariantName: winnerVariant?.variantName ?? null,
      variants: results.variants.map((v) => ({
        name: v.variantName,
        isControl: v.variantId === results.controlVariantId,
        evidenceState: v.stats.evidenceState,
        returnRatePct: Math.round(v.stats.returnRate * 1000) / 10,
        netIncrementalValue: v.economics.estimatedNetIncrementalValue,
      })),
    };

    const winnerVariantId =
      winner.kind === 'NO_CONCLUSION' ? null : winner.variantId;
    const otherVariantNames = results.variants
      .filter((v) => v.variantId !== winnerVariantId)
      .map((v) => v.variantName);

    try {
      const result = await this.provider.generateStructured<{
        headline: string;
        explanation: string;
      }>({
        useCase: AI_USE_CASES.RECOMMENDATION_EXPLANATION,
        systemPrompt: SYSTEM_PROMPT,
        userPayload: facts,
        schema: SCHEMA,
        promptVersion: RECOMMENDATION_EXPLANATION_PROMPT_VERSION,
        temperature: 0.3, // low — this is an explanation, not creative copy (Fase F §30)
        maxOutputTokens: 220,
        timeoutMs: 6_000,
      });

      const contradicts =
        winnerVariant !== null &&
        explanationContradictsRecommendation(
          `${result.data.headline} ${result.data.explanation}`,
          winnerVariant.variantName,
          otherVariantNames,
        );

      await this.usage.record({
        businessId,
        useCase: AI_USE_CASES.RECOMMENDATION_EXPLANATION,
        model: result.model,
        promptVersion: RECOMMENDATION_EXPLANATION_PROMPT_VERSION,
        success: true,
        fallbackUsed: contradicts,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
      });

      if (contradicts) {
        this.logger.warn(
          `AI recommendation explanation contradicted the engine's winner for experiment ${experimentId} — rejected`,
        );
        return null;
      }

      return {
        headline: result.data.headline,
        explanation: result.data.explanation,
        copySource: 'AI',
      };
    } catch (error) {
      const reason =
        error instanceof AiProviderError ? error.reason : 'UNKNOWN';
      this.logger.warn(
        `AI recommendation explanation failed (${reason}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.usage.record({
        businessId,
        useCase: AI_USE_CASES.RECOMMENDATION_EXPLANATION,
        model: 'unknown',
        promptVersion: RECOMMENDATION_EXPLANATION_PROMPT_VERSION,
        success: false,
        fallbackUsed: true,
      });
      return null;
    }
  }
}

/**
 * Fase F §21/§50 — a deterministic (not AI-judged) consistency check: if the
 * text recommends something ("recomendamos", "conviene", ...) while naming a
 * DIFFERENT variant than the engine's own winner, and never names the winner
 * itself, treat it as a contradiction and reject.
 */
function explanationContradictsRecommendation(
  text: string,
  winnerVariantName: string,
  otherVariantNames: string[],
): boolean {
  const lower = text.toLowerCase();
  const recommendKeywords = [
    'recomend',
    'convien',
    'mejor opción',
    'preferimos',
    'sugerimos',
    'elegir',
  ];
  const mentionsRecommendKeyword = recommendKeywords.some((k) =>
    lower.includes(k),
  );
  if (!mentionsRecommendKeyword) return false;

  const mentionsWinner = lower.includes(winnerVariantName.toLowerCase());
  const mentionsOther = otherVariantNames.some((name) =>
    lower.includes(name.toLowerCase()),
  );
  return mentionsOther && !mentionsWinner;
}
