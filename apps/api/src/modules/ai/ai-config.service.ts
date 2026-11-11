import { Injectable, Logger } from '@nestjs/common';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_MAX_DAILY_GENERATIONS = 50;
const DEFAULT_MAX_MONTHLY_GENERATIONS = 1_000;
const DEFAULT_MAX_DAILY_CHATBOT_MESSAGES = 40;
const DEFAULT_MAX_DAILY_INTELLIGENCE_TURNS = 60;
const DEFAULT_AGENT_TURN_TIMEOUT_MS = 45_000;
/** USD por millón de tokens — precio público de `gpt-4o-mini`, el modelo por defecto. */
const DEFAULT_PRICE_INPUT_PER_MILLION_USD = 0.15;
const DEFAULT_PRICE_OUTPUT_PER_MILLION_USD = 0.6;
/** Corridas del planificador por negocio y día (diaria + a pedido). */
const DEFAULT_PLANNER_MAX_RUNS_PER_DAY = 3;
/** Tope de gasto del planificador por negocio y mes, en USD. */
const DEFAULT_PLANNER_MONTHLY_USD_CAP = 2;

/**
 * Fase F §3/§4 — reads every AI-related env var once, with safe defaults, and
 * exposes a single `globallyEnabled` read the rest of the module treats as
 * the platform kill switch (Fase F §5/§40).
 *
 * Nothing here throws at boot: a missing `OPENAI_API_KEY` is an entirely
 * ordinary, supported configuration (`AI_ENABLED` stays effectively off),
 * not a startup error — Flikker must keep working with zero AI configured.
 */
@Injectable()
export class AiConfigService {
  private readonly logger = new Logger(AiConfigService.name);

  readonly apiKey: string | null;
  readonly model: string;
  readonly globallyEnabled: boolean;
  readonly maxDailyGenerationsPerBusiness: number;
  readonly maxMonthlyGenerationsPerBusiness: number;
  readonly timeoutMs: number;
  /**
   * Tope propio del asistente flotante — el pool genérico de arriba es
   * compartido por TODOS los usos de IA de un negocio (copy de retención,
   * resumen de Insights, chat); sin un tope propio, un día charlatán con el
   * chatbot podría agotar el presupuesto de todo lo demás, o viceversa.
   */
  readonly maxDailyChatbotMessagesPerBusiness: number;
  /** Tope propio de turnos del agente de Intelligence, mismo criterio que el chatbot. */
  readonly maxDailyIntelligenceTurnsPerBusiness: number;
  /** Tiempo máximo de un turno completo del agente, sumando todas sus rondas. */
  readonly agentTurnTimeoutMs: number;
  readonly priceInputPerMillionUsd: number;
  readonly priceOutputPerMillionUsd: number;
  /**
   * Planificador comercial: modelo y precios propios (puede ser uno más capaz
   * que el del chat), y topes propios por negocio para que un modelo caro
   * nunca se coma el presupuesto de nada más.
   */
  readonly plannerModel: string;
  readonly plannerPriceInputPerMillionUsd: number;
  readonly plannerPriceOutputPerMillionUsd: number;
  readonly plannerMaxRunsPerDay: number;
  readonly plannerMonthlyUsdCapPerBusiness: number;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY?.trim() || null;
    this.model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
    // Safe default: OFF. A pilot turns this on explicitly (Fase F §5).
    this.globallyEnabled = process.env.AI_ENABLED === 'true';
    this.maxDailyGenerationsPerBusiness = parsePositiveInt(
      process.env.AI_MAX_DAILY_GENERATIONS,
      DEFAULT_MAX_DAILY_GENERATIONS,
    );
    this.maxMonthlyGenerationsPerBusiness = parsePositiveInt(
      process.env.AI_MAX_MONTHLY_GENERATIONS,
      DEFAULT_MAX_MONTHLY_GENERATIONS,
    );
    this.timeoutMs = parsePositiveInt(
      process.env.AI_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    );
    this.maxDailyChatbotMessagesPerBusiness = parsePositiveInt(
      process.env.AI_MAX_DAILY_CHATBOT_MESSAGES,
      DEFAULT_MAX_DAILY_CHATBOT_MESSAGES,
    );
    this.maxDailyIntelligenceTurnsPerBusiness = parsePositiveInt(
      process.env.AI_MAX_DAILY_INTELLIGENCE_TURNS,
      DEFAULT_MAX_DAILY_INTELLIGENCE_TURNS,
    );
    this.agentTurnTimeoutMs = parsePositiveInt(
      process.env.AI_AGENT_TURN_TIMEOUT_MS,
      DEFAULT_AGENT_TURN_TIMEOUT_MS,
    );
    this.priceInputPerMillionUsd = parsePositiveNumber(
      process.env.AI_PRICE_INPUT_PER_MILLION_USD,
      DEFAULT_PRICE_INPUT_PER_MILLION_USD,
    );
    this.priceOutputPerMillionUsd = parsePositiveNumber(
      process.env.AI_PRICE_OUTPUT_PER_MILLION_USD,
      DEFAULT_PRICE_OUTPUT_PER_MILLION_USD,
    );

    this.plannerModel = process.env.AI_PLANNER_MODEL?.trim() || this.model;
    // Sin precios propios, los del modelo general: correcto solo si el
    // planificador usa el mismo modelo, por eso se avisa abajo.
    this.plannerPriceInputPerMillionUsd = parsePositiveNumber(
      process.env.AI_PLANNER_PRICE_INPUT_PER_MILLION_USD,
      this.priceInputPerMillionUsd,
    );
    this.plannerPriceOutputPerMillionUsd = parsePositiveNumber(
      process.env.AI_PLANNER_PRICE_OUTPUT_PER_MILLION_USD,
      this.priceOutputPerMillionUsd,
    );
    this.plannerMaxRunsPerDay = parsePositiveInt(
      process.env.AI_PLANNER_MAX_RUNS_PER_DAY,
      DEFAULT_PLANNER_MAX_RUNS_PER_DAY,
    );
    this.plannerMonthlyUsdCapPerBusiness = parsePositiveNumber(
      process.env.AI_PLANNER_MONTHLY_USD_CAP,
      DEFAULT_PLANNER_MONTHLY_USD_CAP,
    );
    if (
      this.plannerModel !== this.model &&
      !process.env.AI_PLANNER_PRICE_INPUT_PER_MILLION_USD
    ) {
      this.logger.warn(
        `AI_PLANNER_MODEL=${this.plannerModel} sin AI_PLANNER_PRICE_*: el costo del planificador se estima con los precios de ${this.model}.`,
      );
    }

    if (this.globallyEnabled && !this.apiKey) {
      // Not fatal — every caller still falls back to the deterministic
      // template — but worth a loud boot-time warning, since it means the
      // owner thinks AI is on when it can never actually run.
      this.logger.warn(
        'AI_ENABLED=true but OPENAI_API_KEY is not set — every AI call will fall back to deterministic templates.',
      );
    }
  }

  /** Whether the provider has enough configuration to ever be called. */
  get providerConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /** Costo estimado de una corrida del planificador, con sus precios. */
  estimatePlannerCostUsd(inputTokens: number, outputTokens: number): number {
    const cost =
      (inputTokens * this.plannerPriceInputPerMillionUsd +
        outputTokens * this.plannerPriceOutputPerMillionUsd) /
      1_000_000;
    return Math.round(cost * 1_000_000) / 1_000_000;
  }

  /** Costo estimado, con el precio configurado — nunca la factura real del proveedor. */
  estimateCostUsd(
    inputTokens: number | null,
    outputTokens: number | null,
  ): number | null {
    if (inputTokens === null && outputTokens === null) return null;
    const cost =
      ((inputTokens ?? 0) * this.priceInputPerMillionUsd +
        (outputTokens ?? 0) * this.priceOutputPerMillionUsd) /
      1_000_000;
    return Math.round(cost * 1_000_000) / 1_000_000;
  }
}

function parsePositiveNumber(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
