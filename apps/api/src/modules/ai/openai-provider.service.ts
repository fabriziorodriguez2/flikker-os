import { Injectable, Logger } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';
import {
  AiProviderError,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiProvider,
} from './ai-provider.interface';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * Fase F §2/§32 — the one and only place the OpenAI HTTP API is called.
 * Plain `fetch`, no SDK (mirrors `WhatsAppBspService`'s own pattern for
 * WHAPI) — a JSON REST call does not justify a new dependency, and it keeps
 * every business service decoupled from the vendor's client library, not
 * just its concepts.
 *
 * Uses Chat Completions' `response_format: json_schema` (structured
 * outputs) so the model is constrained to the requested shape server-side —
 * never "parse whatever text comes back with a regex".
 */
@Injectable()
export class OpenAiProviderService implements AiProvider {
  private readonly logger = new Logger(OpenAiProviderService.name);

  constructor(private readonly config: AiConfigService) {}

  get configured(): boolean {
    return this.config.providerConfigured;
  }

  async generateStructured<T>(
    request: AiGenerateRequest,
  ): Promise<AiGenerateResult<T>> {
    if (!this.configured) {
      throw new AiProviderError(
        'OpenAI is not configured (OPENAI_API_KEY missing)',
        'NOT_CONFIGURED',
      );
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: request.temperature,
          max_tokens: request.maxOutputTokens,
          messages: [
            { role: 'system', content: request.systemPrompt },
            // The whole point of a structured, data-only payload (Fase F
            // §8/§33/§34): this is content, never an instruction.
            { role: 'user', content: JSON.stringify(request.userPayload) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: request.schema.name,
              strict: true,
              schema: request.schema.schema,
            },
          },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiProviderError(
          `OpenAI request timed out after ${request.timeoutMs}ms`,
          'TIMEOUT',
        );
      }
      throw new AiProviderError(
        `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN',
      );
    } finally {
      clearTimeout(timeout);
    }

    const latencyMs = Date.now() - startedAt;
    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      throw new AiProviderError(
        `OpenAI HTTP ${response.status}: ${JSON.stringify(payload)}`,
        'HTTP_ERROR',
      );
    }

    const content = extractContent(payload);
    if (!content) {
      throw new AiProviderError(
        'OpenAI response had no message content',
        'INVALID_RESPONSE',
      );
    }

    let data: T;
    try {
      data = JSON.parse(content) as T;
    } catch {
      throw new AiProviderError(
        'OpenAI response content was not valid JSON',
        'INVALID_RESPONSE',
      );
    }

    const usage = extractUsage(payload);
    this.logger.log(
      `OpenAI ${request.useCase} model=${this.config.model} latencyMs=${latencyMs} tokens=${usage.inputTokens ?? '?'}/${usage.outputTokens ?? '?'}`,
    );

    return {
      data,
      model: this.config.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs,
    };
  }
}

function extractContent(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message: unknown = choices[0];
  if (!isRecord(message) || !isRecord(message.message)) return null;
  const content = message.message.content;
  return typeof content === 'string' && content.trim() ? content : null;
}

function extractUsage(payload: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
} {
  if (!isRecord(payload) || !isRecord(payload.usage)) {
    return { inputTokens: null, outputTokens: null };
  }
  const usage = payload.usage;
  return {
    inputTokens: numberOrNull(usage.prompt_tokens),
    outputTokens: numberOrNull(usage.completion_tokens),
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
