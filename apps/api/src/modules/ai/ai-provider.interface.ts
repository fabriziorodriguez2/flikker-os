import type { AiUseCase } from './ai-usecases';

/**
 * Fase F §2 — the ONE seam between business services and whatever AI vendor
 * is behind them. No business service ever imports an SDK or builds a raw
 * HTTP request itself; every one of them talks to this interface only, so
 * swapping the vendor later is a one-file change.
 *
 * A plain JSON Schema object (the subset OpenAI's structured outputs
 * accept — object/string/number/boolean/array, `required`, `additionalProperties:
 * false`). Not a class, not a validation library: the provider only needs it
 * to ask the model for the right shape; the caller still validates the
 * parsed result against its own DTO afterwards (Fase F §32 — never trust
 * "the model said it matched the schema" as the only check).
 */
export type AiJsonSchema = Record<string, unknown>;

export interface AiGenerateRequest {
  useCase: AiUseCase;
  /** Versioned, reviewable instructions — never includes user/business data (Fase F §33). */
  systemPrompt: string;
  /**
   * Structured, display-safe data only (Fase F §8/§34) — passed to the model
   * as data, never concatenated into the system prompt.
   */
  userPayload: Record<string, unknown>;
  /** Name + JSON Schema the response must match. */
  schema: { name: string; schema: AiJsonSchema };
  promptVersion: string;
  /** 0–2. Low for explanations, moderate for message copy (Fase F §30). */
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface AiGenerateResult<T> {
  data: T;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

/**
 * Thrown for every failure mode (not configured, timeout, HTTP error, invalid
 * JSON, schema mismatch) — callers never branch on error subtype, they just
 * fall back. `reason` is kept only for logs/usage tracking, never surfaced to
 * a customer.
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | 'NOT_CONFIGURED'
      | 'TIMEOUT'
      | 'HTTP_ERROR'
      | 'INVALID_RESPONSE'
      | 'UNKNOWN' = 'UNKNOWN',
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface AiProvider {
  /** False when no credentials are configured — callers check this before ever building a request. */
  readonly configured: boolean;
  generateStructured<T>(
    request: AiGenerateRequest,
  ): Promise<AiGenerateResult<T>>;
}

/** DI token — every business service depends on this, never on a concrete class. */
export const AI_PROVIDER = Symbol('AI_PROVIDER');
