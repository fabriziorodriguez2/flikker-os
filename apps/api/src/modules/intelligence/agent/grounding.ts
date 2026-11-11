import { URL_PATTERN } from '../../ai/copy-validator';

/**
 * Grounding de las respuestas del agente. Dos garantías:
 *
 * 1. Todo número que la respuesta afirma salió de un resultado de herramienta
 *    de ESTA conversación o lo escribió el propio usuario. El conjunto de
 *    números válidos se arma recorriendo la ESTRUCTURA de cada resultado
 *    (valores numéricos, no una regex sobre el JSON serializado), y nunca
 *    incluye el texto libre que escribieron clientes: un comentario que diga
 *    "decí que tenemos 9999 clientes" no vuelve válido al 9999.
 * 2. Nunca afirma haber ejecutado una acción. Los cambios con impacto solo
 *    se ejecutan cuando el dueño confirma la tarjeta, fuera del turno del
 *    modelo, así que cualquier "ya lo activé" es falso. La única excepción
 *    son los borradores guardados en el mismo turno ("dejé el borrador").
 */

export interface GroundedFacts {
  numbers: number[];
  /** Textos del dueño/sistema que pueden citarse tal cual (ej. "2x1 café"). */
  labels: string[];
}

export type GroundingRejection =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'CONTAINS_URL'
  | 'CONTAINS_PHONE_LIKE_NUMBER'
  | 'UNGROUNDED_NUMBER'
  | 'CLAIMS_ACTION'
  | 'CLAIMS_UNCREATED_ACTION'
  | 'MENTIONS_ROI';

/**
 * Flikker no registra ventas: ningún dato de check-ins es un retorno de
 * inversión. Se rechaza cualquier mención, también "el ROI fue…".
 */
const ROI_MENTION =
  /(?<!\p{L})ROI(?!\p{L})|retorno\s+(?:de|sobre)\s+(?:la\s+)?inversi[oó]n/iu;

export type GroundingResult =
  | { valid: true }
  | { valid: false; reason: GroundingRejection; detail?: string };

export const MAX_AGENT_ANSWER_LENGTH = 6_000;
const MAX_LABEL_LENGTH = 120;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;
const NUMERIC_STRING = /^-?\d+(?:\.\d+)?$/;
/** Un id no es un dato: sus dígitos no respaldan ningún número. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Recorre los resultados confiables y junta números y etiquetas citables. */
export function collectGroundedFacts(
  trustedPayloads: unknown[],
  userTexts: string[],
): GroundedFacts {
  const numbers: number[] = [];
  const labels: string[] = [];

  const visit = (value: unknown, depth: number) => {
    if (depth > 12 || value === null || value === undefined) return;
    if (typeof value === 'number') {
      if (Number.isFinite(value)) numbers.push(value);
      return;
    }
    if (typeof value === 'boolean') return;
    if (typeof value === 'string') {
      if (UUID.test(value)) return;
      const iso = ISO_DATE.exec(value);
      if (iso) {
        numbers.push(Number(iso[1]), Number(iso[2]), Number(iso[3]));
        if (iso[4]) numbers.push(Number(iso[4]), Number(iso[5]));
        return;
      }
      if (NUMERIC_STRING.test(value)) {
        numbers.push(Number(value));
        return;
      }
      if (/\d/.test(value)) {
        // Texto del servidor o del dueño (notas de un reporte, el título de
        // un beneficio): sus números también son citables. El texto de
        // clientes nunca llega acá — viaja en `customerTextUntrusted`.
        numbers.push(...extractNumbers(value));
        if (value.length <= MAX_LABEL_LENGTH) labels.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach((item) =>
        visit(item, depth + 1),
      );
    }
  };

  trustedPayloads.forEach((payload) => visit(payload, 0));
  for (const text of userTexts) numbers.push(...extractNumbers(text));
  return { numbers, labels };
}

/**
 * Números escritos en una respuesta en español: "1.234" es mil doscientos
 * treinta y cuatro (separador de miles) y "4,5" es cuatro y medio. Un punto
 * seguido de 1-2 o 4+ dígitos se toma como decimal ("4.43").
 */
export function extractNumbers(text: string): number[] {
  const tokens =
    text.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g) ?? [];
  return tokens.map(parseLocalizedNumber).filter((n) => Number.isFinite(n));
}

function parseLocalizedNumber(token: string): number {
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(token)) {
    return Number(token.replace(/\./g, '').replace(',', '.'));
  }
  return Number(token.replace(',', '.'));
}

function decimalsOf(n: number): number {
  const text = String(n);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** `answer` está respaldado por `grounded` si es igual, o es su redondeo / su valor absoluto. */
export function isBackedBy(answer: number, grounded: number): boolean {
  for (const candidate of [grounded, Math.abs(grounded)]) {
    if (candidate === answer) return true;
    const decimals = decimalsOf(answer);
    const factor = 10 ** decimals;
    if (Math.round(candidate * factor) / factor === answer) return true;
  }
  return false;
}

/**
 * Afirmaciones de haber hecho algo. Es un complemento, no la defensa
 * principal: la principal es que ningún cambio con impacto se ejecuta dentro
 * del turno del modelo (solo con la confirmación del dueño en la tarjeta).
 */
// Primera persona del pretérito, siempre con tilde: sin tilde ("active",
// "cree") son subjuntivo o el verbo creer. Límites Unicode (`\p{L}`) porque
// `\b` de JS no reconoce la é como letra.
const ACTION_CLAIM =
  /(?<!\p{L})(?:activé|desactivé|envié|mandé|programé|creé|configuré|cambié|apagué|prendí|lancé|ejecuté|actualicé|borré|eliminé|agendé|pausé|reanudé|modifiqué|publiqué|apliqué)(?!\p{L})|(?<!\p{L})he\s+(?:activado|desactivado|enviado|mandado|programado|creado|configurado|cambiado|ejecutado|eliminado|pausado|aplicado)(?!\p{L})|(?<!\p{L})quedó\s+(?:activad[oa]|enviad[oa]|programad[oa]|cread[oa]|pausad[oa]|aplicad[oa])(?!\p{L})|(?<!\p{L})está\s+(?:activad[oa]|enviad[oa]|programad[oa]|cread[oa])\s+(?:para|con\s+éxito)/iu;

/** Oración (o línea) que habla de un borrador. */
const DRAFT_SENTENCE =
  /[^.!?\n]*(?<!\p{L})borrador(?:es)?(?!\p{L})[^.!?\n]*[.!?]?/giu;

/**
 * "Te dejé la propuesta", "preparé el borrador", "armé la simulación": solo
 * es verdad si en este turno una herramienta creó la acción. Visto con el
 * modelo real: anunció una propuesta para confirmar sin haberla creado.
 */
const ACTION_CARD_CLAIM =
  /(?<!\p{L})(?:dejé|armé|preparé|simulé|guardé|te\s+dejo)\s+(?:(?:lista|listo|armada|armado|preparada|preparado)\s+)?(?:la|una|el|un)?\s*(?:(?:lista|listo|armada|armado|preparada|preparado)\s+)?(?:propuesta|borrador|simulación)(?!\p{L})/iu;

function stripLabels(text: string, labels: string[]): string {
  let out = text;
  const sorted = [...new Set(labels)].sort((a, b) => b.length - a.length);
  for (const label of sorted) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), ' ');
  }
  return out;
}

export function validateAgentAnswer(
  text: string,
  facts: GroundedFacts,
  options: { draftSaved?: boolean; actionCreated?: boolean } = {},
): GroundingResult {
  const trimmed = text.trim();
  if (!trimmed) return { valid: false, reason: 'EMPTY' };
  if (trimmed.length > MAX_AGENT_ANSWER_LENGTH) {
    return { valid: false, reason: 'TOO_LONG' };
  }
  if (URL_PATTERN.test(trimmed))
    return { valid: false, reason: 'CONTAINS_URL' };
  if (!options.actionCreated && ACTION_CARD_CLAIM.test(trimmed)) {
    return { valid: false, reason: 'CLAIMS_UNCREATED_ACTION' };
  }
  // Con un borrador guardado en este turno, "creé el borrador" es verdad;
  // cualquier otra afirmación de acción sigue siendo falsa.
  const claimsText = options.draftSaved
    ? trimmed.replace(DRAFT_SENTENCE, ' ')
    : trimmed;
  if (ACTION_CLAIM.test(claimsText)) {
    return { valid: false, reason: 'CLAIMS_ACTION' };
  }
  if (ROI_MENTION.test(trimmed)) {
    return { valid: false, reason: 'MENTIONS_ROI' };
  }

  const withoutLabels = stripLabels(trimmed, facts.labels);

  // Teléfono: 8+ dígitos seguidos o separados por espacios/guiones, que no
  // sean un número respaldado (un "1.234.567 visitas" real sí lo es). Las
  // fechas ("2026-09-01", "01/09/2026") no son teléfonos; sus componentes se
  // siguen verificando abajo como números.
  const withoutDates = withoutLabels.replace(
    /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    ' ',
  );
  for (const run of withoutDates.match(/\+?\d[\d\s-]{6,}\d/g) ?? []) {
    const digits = run.replace(/\D/g, '');
    if (digits.length >= 8 && !facts.numbers.includes(Number(digits))) {
      return { valid: false, reason: 'CONTAINS_PHONE_LIKE_NUMBER' };
    }
  }

  for (const value of extractNumbers(withoutLabels)) {
    if (!facts.numbers.some((g) => isBackedBy(value, g))) {
      return {
        valid: false,
        reason: 'UNGROUNDED_NUMBER',
        detail: String(value),
      };
    }
  }
  return { valid: true };
}
