import { PHONE_LIKE_PATTERN, URL_PATTERN } from '../ai/copy-validator';

/**
 * Validación determinística de la respuesta "data" del chatbot — mismo
 * espíritu que `copy-validator.ts` (Fase F §10/§11): nunca una segunda
 * llamada a IA para validar, siempre "si dudás, usá el fallback".
 *
 * La regla propia de este caso (distinta de `copy-validator.ts`, que
 * compara contra un puñado de campos comerciales fijos): la respuesta le
 * describe al dueño SUS PROPIOS números, así que la única garantía que
 * importa es "todo número que la respuesta menciona ya estaba en las
 * métricas que le mandamos" — nunca un número inventado o mal recordado.
 */

export type ChatbotAnswerRejectionReason =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'CONTAINS_URL'
  | 'CONTAINS_PHONE_LIKE_NUMBER'
  | 'UNGROUNDED_NUMBER';

export type ChatbotAnswerValidationResult =
  | { valid: true }
  | { valid: false; reason: ChatbotAnswerRejectionReason };

const MAX_ANSWER_LENGTH = 500;
const NUMBER_PATTERN = /\d+(?:[.,]\d+)?/g;

function extractNumbers(text: string): number[] {
  const matches: string[] = text.match(NUMBER_PATTERN) ?? [];
  return matches.map((m: string) => Number(m.replace(',', '.')));
}

export function validateChatbotDataAnswer(
  text: string,
  payload: Record<string, unknown>,
  maxLength: number = MAX_ANSWER_LENGTH,
): ChatbotAnswerValidationResult {
  const trimmed = text.trim();
  if (!trimmed) return reject('EMPTY');
  if (trimmed.length > maxLength) return reject('TOO_LONG');
  if (URL_PATTERN.test(trimmed)) return reject('CONTAINS_URL');
  if (PHONE_LIKE_PATTERN.test(trimmed)) {
    return reject('CONTAINS_PHONE_LIKE_NUMBER');
  }

  const answerNumbers = extractNumbers(trimmed);
  const payloadNumbers = new Set(extractNumbers(JSON.stringify(payload)));
  const hasUngroundedNumber = answerNumbers.some((n) => !payloadNumbers.has(n));
  if (hasUngroundedNumber) return reject('UNGROUNDED_NUMBER');

  return { valid: true };
}

function reject(
  reason: ChatbotAnswerRejectionReason,
): ChatbotAnswerValidationResult {
  return { valid: false, reason };
}
