/**
 * Texto escrito por clientes que llega al modelo (comentarios privados).
 *
 * La garantía de fondo es estructural: este texto nunca respalda un número y
 * el agente no tiene herramientas de escritura. Esto es una capa extra: un
 * comentario con forma de instrucción dirigida al asistente confunde al
 * modelo aunque no lo obedezca (en pruebas reales, al esquivar repetirlo,
 * terminaba atribuyéndole su puntaje a otro comentario). Se reemplaza por un
 * aviso neutro; el dueño lo sigue viendo completo en Reseñas.
 */

export const OMITTED_COMMENT_NOTICE =
  '[Comentario omitido: parece contener instrucciones dirigidas al asistente. El dueño puede leerlo completo en Reseñas.]';

const INSTRUCTION_PATTERNS: RegExp[] = [
  /ignor[áae]\w*\s+(?:todas?\s+)?(?:tus|las|sus)?\s*instruc/iu,
  /olvid[áae]\w*\s+(?:todo|tus|las)/iu,
  /(?:system|sistema)\s*prompt/iu,
  /\b(?:decile|dile|decí|respondé|responde)\s+al\s+(?:dueño|due[ñn]o|usuario)/iu,
  /\b(?:sos|eres)\s+(?:un|una|el|la)\s+(?:asistente|ia|modelo)/iu,
  /\byou\s+are\s+(?:an?\s+)?(?:assistant|ai)\b|\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i,
];

export function looksLikeInstructions(text: string): boolean {
  return INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Datos de contacto que un cliente escribe dentro de su comentario
 * ("llamame al 099 123 456", "escribime a ana@…"). El análisis no los
 * necesita y no tienen por qué viajar a OpenAI: se reemplazan antes de que
 * el texto salga del servidor. El dueño los sigue viendo en Reseñas.
 */
const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
/** 7+ dígitos, con espacios, puntos, guiones o paréntesis entre medio. */
const PHONE_PATTERN = /\+?\(?\d[\d\s().-]{5,}\d/g;

export function redactContactData(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[email]')
    .replace(PHONE_PATTERN, (match) =>
      match.replace(/\D/g, '').length >= 7 ? '[teléfono]' : match,
    );
}

export function sanitizeCustomerComment(
  text: string,
  maxLength: number,
): { comment: string; omitted: boolean } {
  if (looksLikeInstructions(text)) {
    return { comment: OMITTED_COMMENT_NOTICE, omitted: true };
  }
  return {
    comment: redactContactData(text).slice(0, maxLength),
    omitted: false,
  };
}
