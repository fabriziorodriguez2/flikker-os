import type { AgentInputItem } from '../../ai/ai-agent-provider.interface';

export interface StoredMessage {
  role: 'USER' | 'ASSISTANT' | 'TOOL';
  kind: 'TEXT' | 'TOOL_RESULT' | 'ACTION';
  content: string;
}

export const HISTORY_MAX_MESSAGES = 24;
export const HISTORY_MAX_CHARS = 16_000;
const MESSAGE_MAX_CHARS = 2_000;

/**
 * Memoria de la conversación para el modelo: los últimos mensajes de usuario
 * y asistente, del más nuevo hacia atrás, hasta llenar el presupuesto. Corte
 * determinístico (nunca un resumen generado por IA que pueda inventar). Los
 * resultados de herramientas no se reenvían: si el modelo los necesita de
 * nuevo, los vuelve a pedir y recibe datos frescos.
 */
export function buildAgentHistory(
  messages: StoredMessage[],
  maxMessages = HISTORY_MAX_MESSAGES,
  maxChars = HISTORY_MAX_CHARS,
): { input: AgentInputItem[]; truncated: boolean } {
  const conversational = messages.filter(
    (m) => (m.role === 'USER' || m.role === 'ASSISTANT') && m.kind === 'TEXT',
  );

  const picked: AgentInputItem[] = [];
  let chars = 0;
  for (let i = conversational.length - 1; i >= 0; i--) {
    const message = conversational[i];
    const content =
      message.content.length > MESSAGE_MAX_CHARS
        ? `${message.content.slice(0, MESSAGE_MAX_CHARS)}…`
        : message.content;
    if (picked.length >= maxMessages || chars + content.length > maxChars)
      break;
    picked.unshift({
      role: message.role === 'USER' ? 'user' : 'assistant',
      content,
    });
    chars += content.length;
  }

  // El turno siempre arranca en un mensaje del usuario.
  while (
    picked.length > 0 &&
    'role' in picked[0] &&
    picked[0].role !== 'user'
  ) {
    picked.shift();
  }

  return { input: picked, truncated: picked.length < conversational.length };
}
