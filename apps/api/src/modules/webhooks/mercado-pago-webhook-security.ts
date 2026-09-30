import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verificación de firma de webhooks de Mercado Pago — confirmada contra la
 * documentación oficial actual (your-integrations/notifications/webhooks),
 * no asumida ni tomada del SDK.
 *
 * Mercado Pago manda dos headers:
 *   `x-signature: ts=<timestamp>,v1=<hex>`
 *   `x-request-id: <uuid>`
 *
 * Y el `data.id` del **query string** (no el del body — los dos deberían
 * coincidir, pero la firma se calcula específicamente sobre el del query
 * string, en minúsculas).
 *
 * El "manifest" que se firma con HMAC-SHA256 es:
 *
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * Si `x-request-id` viene vacío, ese segmento se omite del manifest
 * (documentado explícitamente). HMAC-SHA256 en hex, comparado con
 * `timingSafeEqual` contra el `v1` recibido.
 *
 * Crypto nativo, sin el SDK `mercadopago`: el repo ya resuelve HMAC de
 * webhooks así dos veces (`ShopifyHmacService`, `wasender-webhook-security`)
 * — no se justifica una dependencia nueva para una tercera verificación,
 * más simple que la de Shopify (acá no hace falta el raw body).
 */

export function buildMercadoPagoSignatureManifest(params: {
  dataId: string;
  xRequestId: string | undefined;
  ts: string;
}): string {
  const idPart = `id:${params.dataId.toLowerCase()};`;
  const requestIdPart = params.xRequestId
    ? `request-id:${params.xRequestId};`
    : '';
  const tsPart = `ts:${params.ts};`;
  return `${idPart}${requestIdPart}${tsPart}`;
}

/**
 * `x-signature: ts=1704908010,v1=618c8534...` → `{ ts: '1704908010', v1: '618c8534...' }`.
 * Formato inválido/incompleto devuelve `null` — el caller lo trata como
 * firma inválida, nunca como "falta el header".
 */
export function parseMercadoPagoSignatureHeader(
  header: string | undefined,
): { ts: string; v1: string } | null {
  if (!header) return null;
  const parts = header
    .split(',')
    .reduce<Record<string, string>>((acc, part) => {
      const [key, value] = part.split('=');
      if (key && value) acc[key.trim()] = value.trim();
      return acc;
    }, {});
  if (!parts.ts || !parts.v1) return null;
  return { ts: parts.ts, v1: parts.v1 };
}

export function isValidMercadoPagoSignature(params: {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
  secret: string | undefined;
}): boolean {
  if (!params.secret || !params.dataId) return false;

  const parsed = parseMercadoPagoSignatureHeader(params.xSignature);
  if (!parsed) return false;

  const manifest = buildMercadoPagoSignatureManifest({
    dataId: params.dataId,
    xRequestId: params.xRequestId,
    ts: parsed.ts,
  });

  const computed = createHmac('sha256', params.secret)
    .update(manifest)
    .digest('hex');

  const computedBuf = Buffer.from(computed);
  const receivedBuf = Buffer.from(parsed.v1);
  if (computedBuf.length !== receivedBuf.length) return false;

  try {
    return timingSafeEqual(computedBuf, receivedBuf);
  } catch {
    return false;
  }
}
