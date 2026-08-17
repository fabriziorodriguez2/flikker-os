import { timingSafeEqual } from 'crypto';

/**
 * Verificación de firma de WaSenderAPI — confirmada contra la documentación
 * oficial (api-docs/webhooks/webhook-setup): NO es HMAC sobre el payload,
 * es una comparación directa del header `X-Webhook-Signature` contra el
 * secret guardado (el ejemplo oficial es `signature !== webhookSecret`).
 * Acá se hace con `timingSafeEqual` en vez de `!==` para no filtrar el
 * secret por tiempo de respuesta — WaSenderAPI no lo exige, pero comparar
 * secrets con `!==` es exactamente el tipo de detalle que vale la pena
 * hacer bien una sola vez.
 */
export function isValidWaSenderSignature(
  header: string | string[] | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || typeof header !== 'string' || !header) return false;

  const headerBuf = Buffer.from(header);
  const secretBuf = Buffer.from(secret);
  if (headerBuf.length !== secretBuf.length) return false;

  return timingSafeEqual(headerBuf, secretBuf);
}

/**
 * Idempotencia de eventos — best-effort, en memoria, para un solo proceso
 * (esta API corre como un único servicio Railway, sin réplicas — ver
 * auditoría de `## Workers` de la fase anterior). No es un store
 * distribuido: si algún día hay más de una instancia, esto necesita Redis.
 * Para esta migración (§17 — "evento duplicado: idempotente") alcanza.
 */
const SEEN_TTL_MS = 10 * 60 * 1000;
const seen = new Map<string, number>();

export function isDuplicateWebhookEvent(
  key: string,
  now = Date.now(),
): boolean {
  pruneExpired(now);
  if (seen.has(key)) return true;
  seen.set(key, now + SEEN_TTL_MS);
  return false;
}

function pruneExpired(now: number) {
  for (const [key, expiresAt] of seen) {
    if (expiresAt <= now) seen.delete(key);
  }
}

/** Solo para tests. */
export function resetWaSenderWebhookDedupeCache() {
  seen.clear();
}
