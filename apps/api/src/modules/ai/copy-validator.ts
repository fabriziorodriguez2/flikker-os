/**
 * Fase F §10/§11 — deterministic post-generation validation. Pure function,
 * no second AI call (§11 is explicit: "no depender de una segunda llamada a
 * IA para validar"). Every commercial fact the AI could get wrong is
 * compared against the SAME source-of-truth values the deterministic
 * template would have used — the model never gets to introduce, change or
 * omit one.
 *
 * Any failure here means "fall back to the template" (Fase F §4/§10) —
 * never "retry the model" and never "send anyway".
 */

export interface CopySourceOfTruth {
  /** e.g. 10 for "10% OFF". Null when this message carries no percentage-based incentive. */
  percentageValue: number | null;
  /** e.g. 500 for a $500 benefit. Null when there is no fixed-amount incentive. */
  fixedValue: number | null;
  /** Days the incentive stays valid. Null when there is nothing to say about expiry. */
  expiresInDays: number | null;
  /** True only when "gratis"/"free" is literally accurate here (a real gift/raffle). */
  allowFreeWording: boolean;
  /** True only when this is actually a raffle. */
  allowRaffleWording: boolean;
  maxLength: number;
  /**
   * Fase F §11 — "contiene CTA o intención requerida cuando corresponde".
   * This channel's CTA is a plain sentence, never a URL (§12 already bans
   * URLs outright above), so "contains the CTA" means "mentions the one
   * action that matters" — at least one of these words/phrases, case
   * insensitive. Omit for use cases with no required action (there are
   * none today, but the hook costs nothing).
   */
  requiredIntentKeywords?: string[];
}

export type CopyValidationResult =
  | { valid: true }
  | { valid: false; reason: CopyRejectionReason };

export type CopyRejectionReason =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'CONTAINS_URL'
  | 'CONTAINS_PHONE_LIKE_NUMBER'
  | 'UNAUTHORIZED_PERCENTAGE'
  | 'UNAUTHORIZED_AMOUNT'
  | 'UNAUTHORIZED_EXPIRY'
  | 'UNAUTHORIZED_FREE_CLAIM'
  | 'UNAUTHORIZED_RAFFLE_CLAIM'
  | 'INTERNAL_SEGMENT_LANGUAGE'
  | 'MISSING_REQUIRED_CTA';

// Exportados (no solo de uso interno acá): `chatbot-answer-validator.ts`
// reusa estos mismos dos checks en vez de duplicarlos.
export const URL_PATTERN = /https?:\/\/\S+|www\.\S+/i;
// 8+ digits, optionally grouped with spaces/dots/dashes — long enough that no
// legitimate amount or visit count in this copy ever looks like it.
export const PHONE_LIKE_PATTERN = /\d[\d\s.-]{6,}\d/;
const PERCENTAGE_PATTERN = /(\d{1,3})\s?%/g;
const AMOUNT_PATTERN = /\$\s?([\d.,]+)|(\d[\d.,]*)\s?(?:pesos|uyu|usd)\b/gi;
const EXPIRY_DAYS_PATTERN = /(\d{1,3})\s?d[ií]as?/i;
const FREE_WORDING_PATTERN = /\bgratis\b|\bfree\b/i;
const RAFFLE_WORDING_PATTERN = /\bsorteo\b|\brifa\b/i;
// Fase F §16: the copy must never expose internal segmentation/prediction
// language to the customer, AI-written or not.
const INTERNAL_LANGUAGE_PATTERN =
  /at_risk|riesgo de abandono|abandon|predijimos|predic|trackeando|te seguimos|estamos siguiendo tu actividad/i;

export function validateGeneratedCopy(
  text: string,
  sourceOfTruth: CopySourceOfTruth,
): CopyValidationResult {
  const trimmed = text.trim();
  if (!trimmed) return reject('EMPTY');
  if (trimmed.length > sourceOfTruth.maxLength) return reject('TOO_LONG');
  if (URL_PATTERN.test(trimmed)) return reject('CONTAINS_URL');
  if (PHONE_LIKE_PATTERN.test(trimmed)) {
    return reject('CONTAINS_PHONE_LIKE_NUMBER');
  }

  const percentages = matchAll(trimmed, PERCENTAGE_PATTERN).map((m) =>
    Number(m[1]),
  );
  if (
    percentages.some(
      (value) =>
        sourceOfTruth.percentageValue === null ||
        value !== sourceOfTruth.percentageValue,
    )
  ) {
    return reject('UNAUTHORIZED_PERCENTAGE');
  }

  const hasAmountMention = AMOUNT_PATTERN.test(trimmed);
  AMOUNT_PATTERN.lastIndex = 0;
  if (hasAmountMention && sourceOfTruth.fixedValue === null) {
    return reject('UNAUTHORIZED_AMOUNT');
  }

  const expiryMatch = trimmed.match(EXPIRY_DAYS_PATTERN);
  if (expiryMatch) {
    const mentionedDays = Number(expiryMatch[1]);
    if (
      sourceOfTruth.expiresInDays === null ||
      mentionedDays !== sourceOfTruth.expiresInDays
    ) {
      return reject('UNAUTHORIZED_EXPIRY');
    }
  }

  if (FREE_WORDING_PATTERN.test(trimmed) && !sourceOfTruth.allowFreeWording) {
    return reject('UNAUTHORIZED_FREE_CLAIM');
  }
  if (
    RAFFLE_WORDING_PATTERN.test(trimmed) &&
    !sourceOfTruth.allowRaffleWording
  ) {
    return reject('UNAUTHORIZED_RAFFLE_CLAIM');
  }
  if (INTERNAL_LANGUAGE_PATTERN.test(trimmed)) {
    return reject('INTERNAL_SEGMENT_LANGUAGE');
  }

  const requiredKeywords = sourceOfTruth.requiredIntentKeywords;
  if (requiredKeywords && requiredKeywords.length > 0) {
    const lower = trimmed.toLowerCase();
    const hasIntent = requiredKeywords.some((keyword) =>
      lower.includes(keyword.toLowerCase()),
    );
    if (!hasIntent) return reject('MISSING_REQUIRED_CTA');
  }

  return { valid: true };
}

function reject(reason: CopyRejectionReason): CopyValidationResult {
  return { valid: false, reason };
}

function matchAll(text: string, pattern: RegExp): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  const re = new RegExp(pattern);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    matches.push(match);
  }
  return matches;
}
