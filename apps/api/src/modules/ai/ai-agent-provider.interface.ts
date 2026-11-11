import type { AiUseCase } from './ai-usecases';

/**
 * Contrato del agente con herramientas (Responses API, streaming). Separado
 * de `AiProvider` a propósito: los flujos existentes (copy de retención,
 * resumen, chatbot) siguen usando `generateStructured` sin enterarse de que
 * esto existe.
 */

export interface AgentToolDefinition {
  name: string;
  description: string;
  /** JSON Schema estricto: `additionalProperties: false`, todo `required`. */
  parameters: Record<string, unknown>;
}

export type AgentInputItem =
  | { role: 'user' | 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string };

export interface AgentTurnRequest {
  useCase: AiUseCase;
  instructions: string;
  input: AgentInputItem[];
  tools: AgentToolDefinition[];
  /**
   * `none` en la última ronda: el modelo tiene que responder con lo que ya
   * tiene. `required`: tiene que pedir al menos una herramienta.
   */
  toolChoice: 'auto' | 'none' | 'required';
  maxOutputTokens: number;
  /** Corta la llamada: interrupción del usuario o timeout del turno. */
  signal: AbortSignal;
}

export type AgentStreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; callId: string; name: string; arguments: string }
  | {
      type: 'completed';
      model: string;
      inputTokens: number | null;
      outputTokens: number | null;
      /** `incomplete` = el modelo se quedó sin tokens de salida. */
      status: 'completed' | 'incomplete';
    };

export interface AiAgentProvider {
  readonly configured: boolean;
  /** Una ronda: el modelo responde texto y/o pide herramientas. Tira `AiProviderError`. */
  streamAgentTurn(request: AgentTurnRequest): AsyncGenerator<AgentStreamEvent>;
}

export const AI_AGENT_PROVIDER = Symbol('AI_AGENT_PROVIDER');
