import { Injectable, Logger } from '@nestjs/common';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_MAX_DAILY_GENERATIONS = 50;
const DEFAULT_MAX_MONTHLY_GENERATIONS = 1_000;
const DEFAULT_MAX_DAILY_CHATBOT_MESSAGES = 40;

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
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
