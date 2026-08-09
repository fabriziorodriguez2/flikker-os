import {
  AiProviderError,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiProvider,
} from '../ai/ai-provider.interface';
import { chance, type Rng } from './prng';

export interface FakeAiProviderOptions {
  rng: Rng;
  /** Default `true` — mirrors `AiConfigService.providerConfigured`. */
  configured?: boolean;
  /** Probability any given call fails (§19: e.g. 1.0 for AI_PROVIDER_FAILURE). */
  failureRate?: number;
  /**
   * Builds the "successful" payload for a given request. Defaults to an
   * empty object cast to `T` — deliberately NOT schema-aware (no JSON
   * Schema validator dependency added for this): the point of the fake
   * provider is to exercise the success/failure/timeout/fallback *plumbing*
   * (§17/§18), never to assert that AI copy is good. A caller that needs a
   * schema-shaped success payload for a specific use case supplies its own
   * `responder`.
   */
  responder?: <T>(request: AiGenerateRequest) => T;
}

/**
 * Simulation Center §4/§17/§19 — the ONLY AI provider a simulation may ever
 * bind to `AI_PROVIDER`. It never performs network I/O, never reads
 * `OPENAI_API_KEY`, and is fully seeded/deterministic. Reused unchanged by
 * every real AI-consuming service (e.g. `RetentionAiCopyService`) once the
 * isolated simulation DI context (a later batch) overrides the token.
 */
export class FakeAiProvider implements AiProvider {
  private callCountValue = 0;
  private failureCountValue = 0;

  constructor(private readonly options: FakeAiProviderOptions) {}

  get configured(): boolean {
    return this.options.configured ?? true;
  }

  /** Total calls attempted so far — the engine gates this against `maxAiCalls` (§17). */
  get callCount(): number {
    return this.callCountValue;
  }

  get failureCount(): number {
    return this.failureCountValue;
  }

  async generateStructured<T>(
    request: AiGenerateRequest,
  ): Promise<AiGenerateResult<T>> {
    // Still genuinely async (a real provider always is), just never network
    // I/O — one microtask tick, nothing more.
    await Promise.resolve();
    this.callCountValue++;

    if (!this.configured) {
      throw new AiProviderError(
        'Fake AI provider is not configured for this simulation run',
        'NOT_CONFIGURED',
      );
    }

    if (chance(this.options.rng, this.options.failureRate ?? 0)) {
      this.failureCountValue++;
      throw new AiProviderError(
        'Fake AI provider: simulated failure (failureRate roll)',
        'UNKNOWN',
      );
    }

    const build = this.options.responder ?? (() => ({}) as T);
    return {
      data: build<T>(request),
      model: 'fake-simulation-model',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
  }
}
