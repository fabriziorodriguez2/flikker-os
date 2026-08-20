import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiConfigService } from '../ai/ai-config.service';
import { AiGateService } from '../ai/ai-gate.service';
import { AiUsageService } from '../ai/ai-usage.service';
import {
  AI_PROVIDER,
  AiProviderError,
  type AiProvider,
} from '../ai/ai-provider.interface';
import { AI_USE_CASES } from '../ai/ai-usecases';
import {
  CHATBOT_CLASSIFY_PROMPT_VERSION,
  CHATBOT_DATA_ANSWER_PROMPT_VERSION,
} from '../ai/prompt-versions';
import { InsightsService } from './insights.service';
import { validateChatbotDataAnswer } from './chatbot-answer-validator';
import {
  HELP_FAQ_ENTRIES,
  HELP_FAQ_IDS,
  findHelpFaqEntry,
  matchHelpFaqEntryByText,
  type HelpFaqCta,
} from './chatbot-help-kb';

const DATA_TOOLS = [
  'overview',
  'retention',
  'reviews',
  'promotions',
  'rewards',
  'notifications',
] as const;
export type ChatbotDataTool = (typeof DATA_TOOLS)[number];

export type ChatbotReplySource =
  | 'help_kb'
  | 'data_answer'
  | 'deflection'
  | 'suggested_question';

export interface ChatbotReply {
  text: string;
  source: ChatbotReplySource;
  cta?: HelpFaqCta | null;
}

const DEFLECTION_TEXT =
  'Por ahora no puedo responder — probá de nuevo en un momento, o seguí navegando el panel normalmente.';
const OTHER_INTENT_TEXT =
  'Puedo ayudarte a entender cómo usar Flikker o a ver los números de tu negocio. ¿Sobre cuál de las dos querés preguntar?';
const UNGROUNDED_FALLBACK_TEXT =
  'No tengo la certeza suficiente para confirmar esa cifra ahora — mirá la sección correspondiente en el panel para verla directamente.';

interface ClassifyResult {
  intent: 'help' | 'data' | 'other';
  helpFaqId: string | null;
  dataTool: ChatbotDataTool | null;
}

const CLASSIFY_SCHEMA = {
  name: 'chatbot_classify',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: { type: 'string', enum: ['help', 'data', 'other'] },
      helpFaqId: { type: ['string', 'null'], enum: [...HELP_FAQ_IDS, null] },
      dataTool: { type: ['string', 'null'], enum: [...DATA_TOOLS, null] },
    },
    required: ['intent', 'helpFaqId', 'dataTool'],
  },
};

const ANSWER_SCHEMA = {
  name: 'chatbot_data_answer',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { answer: { type: 'string' } },
    required: ['answer'],
  },
};

function buildClassifySystemPrompt(): string {
  const faqList = HELP_FAQ_ENTRIES.map(
    (e) => `- ${e.id}: "${e.question}"`,
  ).join('\n');
  return `Clasificás UNA pregunta de un dueño de negocio sobre Flikker (fidelización + reseñas). Devolvés SIEMPRE el JSON pedido, con "helpFaqId"/"dataTool" en null cuando no aplican.

"help" = pregunta sobre CÓMO USAR Flikker, o pide que se EJECUTE algo que en realidad el dueño tiene que hacer él mismo desde el panel (crear una promoción, un beneficio, etc. — el asistente nunca ejecuta nada, solo explica cómo). Elegí el "helpFaqId" más relacionado, siempre de esta lista fija (nunca inventes un id que no esté acá):
${faqList}

"data" = pregunta sobre LOS NÚMEROS de este negocio. Elegí el "dataTool" que mejor la responda:
- overview: panorama general
- retention: clientes nuevos/recurrentes/en riesgo/inactivos
- reviews: reseñas de Google, rating, feedback privado
- promotions: rendimiento de promociones enviadas
- rewards: tarjetas de sellos, recompensas desbloqueadas/canjeadas
- notifications: reactivaciones automáticas

"other" = cualquier otra cosa (charla, tema no relacionado con Flikker).`;
}

const DATA_ANSWER_SYSTEM_PROMPT = `Respondés en 1-3 frases, en español rioplatense, la pregunta de un dueño de negocio sobre SUS PROPIOS números en Flikker.
Reglas estrictas:
- Los datos ya calculados vienen en "payload" — nunca inventes ni cambies un número que no esté ahí.
- Nunca menciones un número que no aparezca en el payload.
- Si el payload no alcanza para responder, decilo con honestidad en vez de inventar.
- Nunca digas que podés ejecutar una acción (mandar un mensaje, crear algo) — solo describís datos.
- Devolvé únicamente el JSON pedido.`;

/**
 * "Preguntale a Flikker" — clasificar-y-responder en hasta 2 llamadas por
 * turno (el `AiProvider` actual es de salida estructurada de un solo golpe;
 * no hay tool-calling multi-ronda, y no se construye acá). Un turno completo
 * cuenta como UN uso de `CHATBOT_MESSAGE`, sin importar cuántas llamadas
 * internas hizo.
 */
@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    private readonly gate: AiGateService,
    private readonly usage: AiUsageService,
    private readonly config: AiConfigService,
    private readonly insights: InsightsService,
  ) {}

  async handleMessage(
    businessId: string,
    message: string,
    now: Date = new Date(),
  ): Promise<ChatbotReply> {
    // Prioridad 1 — FAQ/KB determinística: nunca toca `gate`/`usage`/
    // `provider`, así que responde igual aunque la IA esté caída, sin
    // configurar, o sin cupo. Solo si esto no matchea seguimos a la IA.
    const kbMatch = matchHelpFaqEntryByText(message);
    if (kbMatch) {
      return {
        text: kbMatch.answer,
        source: 'help_kb',
        cta: kbMatch.cta ?? null,
      };
    }

    const gateDecision = await this.gate.check(
      businessId,
      AI_USE_CASES.CHATBOT_MESSAGE,
    );
    if (!gateDecision.allowed) {
      this.logger.warn(
        `Chatbot gate denied for business ${businessId}: ${gateDecision.reasonCode}`,
      );
      return { text: DEFLECTION_TEXT, source: 'deflection' };
    }
    const withinCap = await this.usage.hasCapacityForUseCase(
      businessId,
      AI_USE_CASES.CHATBOT_MESSAGE,
      this.config.maxDailyChatbotMessagesPerBusiness,
      now,
    );
    if (!withinCap) {
      this.logger.warn(`Chatbot daily cap reached for business ${businessId}`);
      return { text: DEFLECTION_TEXT, source: 'deflection' };
    }

    const startedAt = Date.now();
    let model = 'unknown';
    let inputTokens = 0;
    let outputTokens = 0;
    let success = true;
    let fallbackUsed = false;
    let reply: ChatbotReply;

    try {
      const classifyResult =
        await this.provider.generateStructured<ClassifyResult>({
          useCase: AI_USE_CASES.CHATBOT_MESSAGE,
          systemPrompt: buildClassifySystemPrompt(),
          userPayload: { question: message.slice(0, 500) },
          schema: CLASSIFY_SCHEMA,
          promptVersion: CHATBOT_CLASSIFY_PROMPT_VERSION,
          temperature: 0.2,
          maxOutputTokens: 100,
          timeoutMs: 6_000,
        });
      model = classifyResult.model;
      inputTokens += classifyResult.inputTokens ?? 0;
      outputTokens += classifyResult.outputTokens ?? 0;
      const classify = classifyResult.data;

      // Nunca se confía ciegamente en que el string devuelto sea uno de los
      // valores reales, aunque el schema ya lo restrinja (Fase F §32).
      if (
        classify.intent === 'help' &&
        classify.helpFaqId &&
        HELP_FAQ_IDS.includes(classify.helpFaqId)
      ) {
        const entry = findHelpFaqEntry(classify.helpFaqId);
        reply = entry
          ? { text: entry.answer, source: 'help_kb', cta: entry.cta ?? null }
          : { text: OTHER_INTENT_TEXT, source: 'deflection' };
      } else if (
        classify.intent === 'data' &&
        classify.dataTool &&
        (DATA_TOOLS as readonly string[]).includes(classify.dataTool)
      ) {
        const toolPayload = await this.fetchToolPayload(
          businessId,
          classify.dataTool,
          now,
        );
        const answerResult = await this.provider.generateStructured<{
          answer: string;
        }>({
          useCase: AI_USE_CASES.CHATBOT_MESSAGE,
          systemPrompt: DATA_ANSWER_SYSTEM_PROMPT,
          userPayload: toolPayload,
          schema: ANSWER_SCHEMA,
          promptVersion: CHATBOT_DATA_ANSWER_PROMPT_VERSION,
          temperature: 0.2,
          maxOutputTokens: 250,
          timeoutMs: 6_000,
        });
        inputTokens += answerResult.inputTokens ?? 0;
        outputTokens += answerResult.outputTokens ?? 0;

        const validation = validateChatbotDataAnswer(
          answerResult.data.answer,
          toolPayload,
        );
        if (validation.valid) {
          reply = { text: answerResult.data.answer, source: 'data_answer' };
        } else {
          this.logger.warn(
            `Chatbot data answer rejected for business ${businessId}: ${validation.reason}`,
          );
          fallbackUsed = true;
          reply = { text: UNGROUNDED_FALLBACK_TEXT, source: 'deflection' };
        }
      } else {
        reply = { text: OTHER_INTENT_TEXT, source: 'deflection' };
      }
    } catch (error) {
      const reason =
        error instanceof AiProviderError ? error.reason : 'UNKNOWN';
      this.logger.warn(
        `Chatbot turn failed for business ${businessId} (${reason}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      success = false;
      fallbackUsed = true;
      reply = { text: DEFLECTION_TEXT, source: 'deflection' };
    }

    await this.usage.record({
      businessId,
      useCase: AI_USE_CASES.CHATBOT_MESSAGE,
      model,
      promptVersion: CHATBOT_CLASSIFY_PROMPT_VERSION,
      success,
      fallbackUsed,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
    });

    return reply;
  }

  /**
   * Los 6 tools controlados — nunca SQL libre. `businessId` siempre viene
   * de la sesión (el caller lo resuelve del JWT, nunca del mensaje del
   * usuario ni de lo que devuelva el modelo).
   */
  private async fetchToolPayload(
    businessId: string,
    tool: ChatbotDataTool,
    now: Date,
  ): Promise<Record<string, unknown>> {
    switch (tool) {
      case 'overview':
        return (await this.insights.getMetricsBundle(
          businessId,
          now,
        )) as unknown as Record<string, unknown>;
      case 'retention':
        return this.insights.getCustomerRetentionStats(businessId, now);
      case 'reviews':
        return this.insights.getReviewStats(businessId, now);
      case 'promotions':
        return {
          campaigns: await this.insights.getPromotionStats(businessId),
        };
      case 'rewards':
        return this.insights.getRewardStats(businessId);
      case 'notifications':
        return this.insights.getNotificationStats(businessId);
    }
  }
}
