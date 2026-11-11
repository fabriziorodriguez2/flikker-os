import { Injectable, Logger } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';
import {
  AiProviderError,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiProvider,
} from './ai-provider.interface';
import type {
  AgentStreamEvent,
  AgentTurnRequest,
  AiAgentProvider,
} from './ai-agent-provider.interface';
import { SseParser } from './sse';

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
export class OpenAiProviderService implements AiProvider, AiAgentProvider {
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

  /**
   * Agente de Intelligence: Responses API con streaming y function calling.
   * Una invocación = una ronda; el orquestador decide si hay otra. `store:
   * false` — OpenAI no guarda la conversación: la memoria es nuestra.
   */
  async *streamAgentTurn(
    request: AgentTurnRequest,
  ): AsyncGenerator<AgentStreamEvent> {
    if (!this.configured) {
      throw new AiProviderError(
        'OpenAI is not configured (OPENAI_API_KEY missing)',
        'NOT_CONFIGURED',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${OPENAI_BASE_URL}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model ?? this.config.model,
          instructions: request.instructions,
          input: request.input,
          tools: request.tools.map((tool) => ({
            type: 'function',
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            strict: true,
          })),
          tool_choice: request.toolChoice,
          stream: true,
          store: false,
          // Los modelos de razonamiento rechazan `temperature`.
          ...(supportsTemperature(request.model ?? this.config.model)
            ? { temperature: 0.3 }
            : {}),
          max_output_tokens: request.maxOutputTokens,
          parallel_tool_calls: true,
        }),
        signal: request.signal,
      });
    } catch (error) {
      throw toProviderError(error, request.signal);
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new AiProviderError(
        `OpenAI HTTP ${response.status}: ${detail.slice(0, 500)}`,
        'HTTP_ERROR',
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let finished = false;

    try {
      while (!finished) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (error) {
          throw toProviderError(error, request.signal);
        }
        if (chunk.done) break;

        for (const message of parser.push(
          decoder.decode(chunk.value, { stream: true }),
        )) {
          if (message.data === '[DONE]') continue;
          let event: unknown;
          try {
            event = JSON.parse(message.data);
          } catch {
            continue;
          }
          if (!isRecord(event)) continue;

          const mapped = mapResponsesEvent(
            event,
            request.model ?? this.config.model,
          );
          if (mapped) {
            yield mapped;
            if (mapped.type === 'completed') finished = true;
          }
        }
      }
    } finally {
      reader.cancel().catch(() => undefined);
    }

    if (!finished) {
      throw new AiProviderError(
        'OpenAI stream ended without a completion event',
        'INVALID_RESPONSE',
      );
    }
  }
}

/** Familias de razonamiento (o1/o3/o4, gpt-5): no aceptan `temperature`. */
export function supportsTemperature(model: string): boolean {
  return !/^(o\d|gpt-5)/i.test(model.trim());
}

function toProviderError(error: unknown, signal: AbortSignal): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (signal.aborted) {
    return new AiProviderError('OpenAI request aborted', 'TIMEOUT');
  }
  return new AiProviderError(
    `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`,
    'UNKNOWN',
  );
}

/** Traduce un evento de la Responses API a lo único que le importa al orquestador. */
export function mapResponsesEvent(
  event: Record<string, unknown>,
  fallbackModel: string,
): AgentStreamEvent | null {
  switch (event.type) {
    case 'response.output_text.delta':
      return typeof event.delta === 'string' && event.delta
        ? { type: 'text_delta', delta: event.delta }
        : null;
    case 'response.output_item.done': {
      const item = event.item;
      if (!isRecord(item) || item.type !== 'function_call') return null;
      if (typeof item.call_id !== 'string' || typeof item.name !== 'string') {
        throw new AiProviderError(
          'OpenAI function_call without call_id/name',
          'INVALID_RESPONSE',
        );
      }
      return {
        type: 'tool_call',
        callId: item.call_id,
        name: item.name,
        arguments: typeof item.arguments === 'string' ? item.arguments : '{}',
      };
    }
    case 'response.completed':
    case 'response.incomplete': {
      const response = isRecord(event.response) ? event.response : {};
      const usage = isRecord(response.usage) ? response.usage : {};
      return {
        type: 'completed',
        model:
          typeof response.model === 'string' ? response.model : fallbackModel,
        inputTokens: numberOrNull(usage.input_tokens),
        outputTokens: numberOrNull(usage.output_tokens),
        status:
          event.type === 'response.completed' ? 'completed' : 'incomplete',
      };
    }
    case 'response.failed': {
      const response = isRecord(event.response) ? event.response : {};
      const error = isRecord(response.error) ? response.error : {};
      throw new AiProviderError(
        `OpenAI response failed: ${typeof error.message === 'string' ? error.message : 'unknown'}`,
        'HTTP_ERROR',
      );
    }
    case 'error':
      throw new AiProviderError(
        `OpenAI stream error: ${typeof event.message === 'string' ? event.message : 'unknown'}`,
        'HTTP_ERROR',
      );
    default:
      return null;
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
