import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  IntelligenceMessageKind,
  IntelligenceMessageRole,
  MembershipRole,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiConfigService } from '../../ai/ai-config.service';
import { AiGateService } from '../../ai/ai-gate.service';
import { AiUsageService } from '../../ai/ai-usage.service';
import { AI_USE_CASES } from '../../ai/ai-usecases';
import { INTELLIGENCE_AGENT_PROMPT_VERSION } from '../../ai/prompt-versions';
import { AiProviderError } from '../../ai/ai-provider.interface';
import {
  AI_AGENT_PROVIDER,
  type AgentInputItem,
  type AiAgentProvider,
} from '../../ai/ai-agent-provider.interface';
import {
  ConversationsService,
  type ConversationScope,
} from '../conversations.service';
import { AgentToolsService, type ToolOutput } from './agent-tools.service';
import { buildAgentHistory } from './agent-history';
import { isExplicitActionRequest } from '../actions/action-plan';
import {
  buildAgentInstructions,
  INTERRUPTED_TEXT,
  NO_ANSWER_TEXT,
  UNVERIFIED_ANSWER_TEXT,
} from './agent-prompt';
import {
  collectGroundedFacts,
  MAX_AGENT_ANSWER_LENGTH,
  validateAgentAnswer,
  type GroundingResult,
} from './grounding';

export const MAX_ROUNDS = 4;
export const MAX_TOOL_CALLS_PER_TURN = 8;
export const MAX_OUTPUT_TOKENS = 1_200;
export const MAX_USER_MESSAGE_LENGTH = 4_000;

type MessageView = Awaited<ReturnType<ConversationsService['appendMessage']>>;

export type AgentAvailability =
  | { available: true }
  | {
      available: false;
      reason:
        | 'PLATFORM_DISABLED'
        | 'PROVIDER_NOT_CONFIGURED'
        | 'BUSINESS_DISABLED'
        | 'DAILY_OR_MONTHLY_CAP_REACHED'
        | 'DAILY_INTELLIGENCE_CAP_REACHED';
      message: string;
    };

const UNAVAILABLE_MESSAGES: Record<
  Exclude<AgentAvailability, { available: true }>['reason'],
  string
> = {
  PLATFORM_DISABLED: 'Intelligence todavía no está disponible.',
  PROVIDER_NOT_CONFIGURED: 'Intelligence todavía no está disponible.',
  BUSINESS_DISABLED:
    'Intelligence todavía no está habilitado para tu negocio. Escribinos por Ayuda y soporte para activarlo.',
  DAILY_OR_MONTHLY_CAP_REACHED:
    'Tu negocio alcanzó el límite de uso de IA por ahora. Probá más tarde.',
  DAILY_INTELLIGENCE_CAP_REACHED:
    'Llegaste al límite de consultas de hoy. Mañana vas a poder seguir.',
};

export type AgentServerEvent =
  | { type: 'user_message'; message: MessageView }
  | { type: 'tool_started'; callId: string; name: string; label: string }
  | {
      type: 'tool_finished';
      callId: string;
      name: string;
      label: string;
      ok: boolean;
      message: MessageView;
    }
  | { type: 'text_delta'; delta: string }
  /** La respuesta transmitida no pasó la verificación y se reemplaza. */
  | { type: 'replace_text'; content: string }
  | { type: 'done'; message: MessageView }
  | {
      type: 'error';
      code: 'TIMEOUT' | 'PROVIDER_ERROR' | 'INTERNAL';
      message: string;
      retryable: true;
    };

export interface PreparedTurn {
  scope: ConversationScope;
  role: MembershipRole;
  conversationId: string;
  userMessage: MessageView | null;
}

/**
 * Orquestador del agente de Intelligence. El modelo decide qué herramientas
 * pedir; el servidor valida, ejecuta con el negocio de la sesión y le
 * devuelve los datos; el modelo explica. Todo lo que pasó queda guardado en
 * la conversación: el mensaje, cada resultado de herramienta y la respuesta
 * final con su verificación.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  /** Un turno a la vez por conversación (en este proceso). */
  private readonly inFlight = new Set<string>();

  constructor(
    @Inject(AI_AGENT_PROVIDER) private readonly provider: AiAgentProvider,
    private readonly prisma: PrismaService,
    private readonly config: AiConfigService,
    private readonly gate: AiGateService,
    private readonly usage: AiUsageService,
    private readonly conversations: ConversationsService,
    private readonly tools: AgentToolsService,
  ) {}

  async availability(businessId: string): Promise<AgentAvailability> {
    const decision = await this.gate.check(
      businessId,
      AI_USE_CASES.INTELLIGENCE_AGENT_TURN,
    );
    if (!decision.allowed) {
      return {
        available: false,
        reason: decision.reasonCode,
        message: UNAVAILABLE_MESSAGES[decision.reasonCode],
      };
    }
    const withinCap = await this.usage.hasCapacityForUseCase(
      businessId,
      AI_USE_CASES.INTELLIGENCE_AGENT_TURN,
      this.config.maxDailyIntelligenceTurnsPerBusiness,
    );
    if (!withinCap) {
      return {
        available: false,
        reason: 'DAILY_INTELLIGENCE_CAP_REACHED',
        message: UNAVAILABLE_MESSAGES.DAILY_INTELLIGENCE_CAP_REACHED,
      };
    }
    return { available: true };
  }

  /**
   * Todo lo que puede fallar como HTTP normal (404, 409) pasa acá, antes de
   * abrir el stream. Si devuelve un turno, el caller DEBE consumir `stream()`
   * (es quien libera el lock de la conversación).
   */
  async prepare(
    scope: ConversationScope,
    role: MembershipRole,
    conversationId: string,
    mode: { kind: 'message'; content: string } | { kind: 'regenerate' },
  ): Promise<PreparedTurn | { unavailable: AgentAvailability }> {
    await this.conversations.get(scope, conversationId);

    const availability = await this.availability(scope.businessId);
    if (!availability.available) return { unavailable: availability };

    if (this.inFlight.has(conversationId)) {
      throw new ConflictException(
        'Ya hay una respuesta en curso en esta conversación',
      );
    }

    if (mode.kind === 'regenerate') {
      const recent = await this.conversations.recentForAgent(
        scope,
        conversationId,
        1,
      );
      if (recent[0]?.role !== IntelligenceMessageRole.USER) {
        throw new ConflictException(
          'No hay una pregunta sin responder para reintentar',
        );
      }
    }

    this.inFlight.add(conversationId);
    try {
      const userMessage =
        mode.kind === 'message'
          ? await this.conversations.appendMessage(scope, conversationId, {
              role: IntelligenceMessageRole.USER,
              content: mode.content,
            })
          : null;
      return { scope, role, conversationId, userMessage };
    } catch (error) {
      this.inFlight.delete(conversationId);
      throw error;
    }
  }

  async *stream(
    turn: PreparedTurn,
    clientSignal: AbortSignal,
  ): AsyncGenerator<AgentServerEvent> {
    const { scope, conversationId } = turn;
    const startedAt = Date.now();
    const deadline = AbortSignal.any([
      clientSignal,
      AbortSignal.timeout(this.config.agentTurnTimeoutMs),
    ]);

    let text = '';
    let rounds = 0;
    let toolCalls = 0;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let model = this.config.model;
    let incomplete = false;

    const addTokens = (input: number | null, output: number | null) => {
      if (input !== null) inputTokens = (inputTokens ?? 0) + input;
      if (output !== null) outputTokens = (outputTokens ?? 0) + output;
    };

    try {
      if (turn.userMessage) {
        yield { type: 'user_message', message: turn.userMessage };
      }

      const now = new Date();
      const [stored, business] = await Promise.all([
        this.conversations.recentForAgent(scope, conversationId),
        this.prisma.business.findUnique({
          where: { id: scope.businessId },
          select: { name: true, timezone: true },
        }),
      ]);

      const facts = collectGroundedFacts(
        stored
          .filter((m) => m.role === IntelligenceMessageRole.TOOL)
          .map((m) => trustedPartOf(m.content)),
        stored
          .filter((m) => m.role === IntelligenceMessageRole.USER)
          .map((m) => m.content),
      );

      const history = buildAgentHistory(stored);
      const input: AgentInputItem[] = [...history.input];
      const instructions = buildAgentInstructions({
        businessName: business?.name ?? 'tu negocio',
        today: new Intl.DateTimeFormat('es-AR', {
          timeZone: business?.timezone ?? 'America/Montevideo',
          dateStyle: 'full',
        }).format(now),
        historyTruncated: history.truncated,
      });
      const lastUserMessage = [...stored]
        .reverse()
        .find((m) => m.role === IntelligenceMessageRole.USER);
      const toolContext = {
        businessId: scope.businessId,
        userId: scope.userId,
        role: turn.role,
        conversationId,
        now,
        sourceMessageId: lastUserMessage?.id ?? null,
        actionRequested: isExplicitActionRequest(
          lastUserMessage?.content ?? '',
        ),
      };
      const toolDefinitions = this.tools.definitions(toolContext);
      // Si en este turno se guardó un borrador, decir "dejé el borrador" es
      // verdad; si se creó una tarjeta, "te dejé la propuesta" también. Un
      // cambio con impacto nunca se ejecuta dentro del turno.
      let draftSaved = false;
      let actionCreated = false;

      // La misma consulta con los mismos parámetros, dos veces en un turno,
      // devuelve el resultado ya obtenido: ni se re-ejecuta ni se duplica.
      const executed = new Map<string, string>();

      while (rounds < MAX_ROUNDS) {
        rounds += 1;
        const lastRound = rounds === MAX_ROUNDS;
        const calls: { callId: string; name: string; arguments: string }[] = [];
        let roundText = '';

        for await (const event of this.provider.streamAgentTurn({
          useCase: AI_USE_CASES.INTELLIGENCE_AGENT_TURN,
          instructions,
          input,
          tools: toolDefinitions,
          // Un pedido explícito de cambio siempre necesita una herramienta (el
          // catálogo o la propuesta). Visto con el modelo real: sin esto,
          // imitaba respuestas anteriores y anunciaba una propuesta sin crearla.
          toolChoice: lastRound
            ? 'none'
            : rounds === 1 && toolContext.actionRequested
              ? 'required'
              : 'auto',
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          signal: deadline,
        })) {
          if (event.type === 'text_delta') {
            roundText += event.delta;
            text += event.delta;
            yield { type: 'text_delta', delta: event.delta };
          } else if (event.type === 'tool_call') {
            calls.push(event);
          } else {
            addTokens(event.inputTokens, event.outputTokens);
            model = event.model;
            incomplete = event.status === 'incomplete';
          }
        }

        if (calls.length === 0 || lastRound) break;

        if (roundText) input.push({ role: 'assistant', content: roundText });
        for (const call of calls) {
          input.push({
            type: 'function_call',
            call_id: call.callId,
            name: call.name,
            arguments: call.arguments,
          });

          const dedupeKey = `${call.name}:${normalizeArguments(call.arguments)}`;
          const previous = executed.get(dedupeKey);
          if (previous !== undefined) {
            input.push({
              type: 'function_call_output',
              call_id: call.callId,
              output: previous,
            });
            continue;
          }

          const label = this.tools.labelFor(call.name);
          let output: ToolOutput;
          if (toolCalls >= MAX_TOOL_CALLS_PER_TURN) {
            output = {
              tool: call.name,
              ok: false,
              error: {
                code: 'TOOL_LIMIT',
                message:
                  'Se alcanzó el máximo de consultas para esta pregunta.',
              },
            };
          } else {
            toolCalls += 1;
            yield {
              type: 'tool_started',
              callId: call.callId,
              name: call.name,
              label,
            };
            output = await this.tools.execute(
              toolContext,
              call.name,
              call.arguments,
            );
          }

          if (output.ok && output.data) {
            const more = collectGroundedFacts([output.data], []);
            facts.numbers.push(...more.numbers);
            facts.labels.push(...more.labels);
            if (typeof output.data.actionId === 'string') actionCreated = true;
            if (
              output.data.mode === 'DRAFT' &&
              output.data.status === 'EXECUTED'
            ) {
              draftSaved = true;
            }
          } else if (output.error) {
            // El motivo de un rechazo lo escribió el servidor (ej. "solo se
            // puede activar desde hoy, 2026-11-10"): también se puede citar.
            const more = collectGroundedFacts([output.error.message], []);
            facts.numbers.push(...more.numbers);
          }

          const serialized = JSON.stringify(output);
          const message = await this.conversations.appendMessage(
            scope,
            conversationId,
            {
              role: IntelligenceMessageRole.TOOL,
              kind: IntelligenceMessageKind.TOOL_RESULT,
              content: serialized,
              metadata: {
                tool: call.name,
                callId: call.callId,
                toolLabel: label,
                ok: output.ok,
                // La interfaz muestra el reporte guardado como tabla/gráfico.
                ...(typeof output.data?.reportId === 'string'
                  ? { reportId: output.data.reportId }
                  : {}),
                // Y cada acción como tarjeta (borrador, propuesta o simulación).
                ...(typeof output.data?.actionId === 'string'
                  ? { actionId: output.data.actionId }
                  : {}),
              },
            },
          );
          yield {
            type: 'tool_finished',
            callId: call.callId,
            name: call.name,
            label,
            ok: output.ok,
            message,
          };
          input.push({
            type: 'function_call_output',
            call_id: call.callId,
            output: serialized,
          });
          if (output.ok) executed.set(dedupeKey, serialized);
        }
      }

      const answer = text.trim() || NO_ANSWER_TEXT;
      const grounding = validateAgentAnswer(answer, facts, {
        draftSaved,
        actionCreated,
      });
      const content = grounding.valid ? answer : UNVERIFIED_ANSWER_TEXT;
      if (!grounding.valid) {
        this.logger.warn(
          `Intelligence answer rejected for business ${scope.businessId}: ${grounding.reason}${grounding.detail ? ` (${grounding.detail})` : ''}`,
        );
        yield { type: 'replace_text', content };
      }

      const message = await this.saveAssistant(turn, content, {
        model,
        rounds,
        toolCalls,
        inputTokens,
        outputTokens,
        grounding,
        incomplete,
      });
      await this.recordUsage(turn, {
        model,
        success: true,
        fallbackUsed: !grounding.valid,
        inputTokens,
        outputTokens,
        startedAt,
      });
      yield { type: 'done', message };
    } catch (error) {
      if (clientSignal.aborted) {
        // El dueño apretó "Detener": se guarda lo que haya llegado, solo si
        // se puede verificar. Nadie está escuchando el stream ya.
        await this.saveInterrupted(
          turn,
          text,
          model,
          inputTokens,
          outputTokens,
        );
        await this.recordUsage(turn, {
          model,
          success: true,
          fallbackUsed: false,
          inputTokens,
          outputTokens,
          startedAt,
        });
        return;
      }

      const timedOut = deadline.aborted;
      this.logger.warn(
        `Intelligence turn failed for business ${scope.businessId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.recordUsage(turn, {
        model,
        success: false,
        fallbackUsed: true,
        inputTokens,
        outputTokens,
        startedAt,
      });
      yield {
        type: 'error',
        code: timedOut
          ? 'TIMEOUT'
          : error instanceof AiProviderError
            ? 'PROVIDER_ERROR'
            : 'INTERNAL',
        message: timedOut
          ? 'La respuesta tardó demasiado. Probá de nuevo.'
          : 'No pudimos generar la respuesta. Probá de nuevo en un momento.',
        retryable: true,
      };
    } finally {
      this.inFlight.delete(conversationId);
    }
  }

  private async saveAssistant(
    turn: PreparedTurn,
    content: string,
    info: {
      model: string;
      rounds: number;
      toolCalls: number;
      inputTokens: number | null;
      outputTokens: number | null;
      grounding: GroundingResult;
      incomplete: boolean;
    },
  ) {
    return this.conversations.appendMessage(turn.scope, turn.conversationId, {
      role: IntelligenceMessageRole.ASSISTANT,
      content,
      metadata: {
        model: info.model,
        promptVersion: INTELLIGENCE_AGENT_PROMPT_VERSION,
        rounds: info.rounds,
        toolCalls: info.toolCalls,
        inputTokens: info.inputTokens,
        outputTokens: info.outputTokens,
        estimatedCostUsd: this.config.estimateCostUsd(
          info.inputTokens,
          info.outputTokens,
        ),
        grounding: info.grounding.valid ? 'verified' : 'rejected',
        groundingReason: info.grounding.valid ? null : info.grounding.reason,
        incomplete: info.incomplete,
      },
    });
  }

  private async saveInterrupted(
    turn: PreparedTurn,
    partial: string,
    model: string,
    inputTokens: number | null,
    outputTokens: number | null,
  ) {
    try {
      const recent = await this.conversations.recentForAgent(
        turn.scope,
        turn.conversationId,
      );
      const facts = collectGroundedFacts(
        recent
          .filter((m) => m.role === IntelligenceMessageRole.TOOL)
          .map((m) => trustedPartOf(m.content)),
        recent
          .filter((m) => m.role === IntelligenceMessageRole.USER)
          .map((m) => m.content),
      );
      const trimmed = partial.trim().slice(0, MAX_AGENT_ANSWER_LENGTH);
      const keep = trimmed && validateAgentAnswer(trimmed, facts).valid;
      await this.conversations.appendMessage(turn.scope, turn.conversationId, {
        role: IntelligenceMessageRole.ASSISTANT,
        content: keep ? trimmed : INTERRUPTED_TEXT,
        metadata: {
          model,
          promptVersion: INTELLIGENCE_AGENT_PROMPT_VERSION,
          interrupted: true,
          inputTokens,
          outputTokens,
          grounding: keep ? 'verified' : 'discarded',
        },
      });
    } catch (error) {
      this.logger.warn(
        `Could not save interrupted answer: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private recordUsage(
    turn: PreparedTurn,
    info: {
      model: string;
      success: boolean;
      fallbackUsed: boolean;
      inputTokens: number | null;
      outputTokens: number | null;
      startedAt: number;
    },
  ) {
    return this.usage.record({
      businessId: turn.scope.businessId,
      useCase: AI_USE_CASES.INTELLIGENCE_AGENT_TURN,
      model: info.model,
      promptVersion: INTELLIGENCE_AGENT_PROMPT_VERSION,
      success: info.success,
      fallbackUsed: info.fallbackUsed,
      inputTokens: info.inputTokens,
      outputTokens: info.outputTokens,
      estimatedCostUsd: this.config.estimateCostUsd(
        info.inputTokens,
        info.outputTokens,
      ),
      latencyMs: Date.now() - info.startedAt,
    });
  }
}

function normalizeArguments(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw || '{}'));
  } catch {
    return raw;
  }
}

/** De un resultado guardado, solo la parte verificable (`data`), nunca el texto de clientes. */
function trustedPartOf(content: string): unknown {
  try {
    const parsed = JSON.parse(content) as { ok?: boolean; data?: unknown };
    return parsed.ok ? parsed.data : null;
  } catch {
    return null;
  }
}
