/** Estados HTTP que por especificación no pueden llevar cuerpo. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/**
 * Arma la respuesta que el proxy devuelve al navegador. `new Response(body,
 * { status: 204 })` tira con cualquier body —incluso un ArrayBuffer vacío—,
 * así que un DELETE que la API respondía bien con 204 llegaba al panel como
 * 500.
 */
/**
 * Server-Sent Events (Intelligence): el cuerpo se reenvía como stream, sin
 * bufferizar — si no, el navegador recibiría toda la respuesta junta al
 * final. `null` para cualquier otra respuesta.
 */
export function buildStreamingProxyResponse(res: Response): Response | null {
  const contentType = res.headers.get("Content-Type") ?? "";
  if (!res.body || !contentType.startsWith("text/event-stream")) return null;
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export function buildProxyResponse(
  status: number,
  body: ArrayBuffer,
  headers: Record<string, string>,
): Response {
  if (NULL_BODY_STATUSES.has(status)) {
    return new Response(null, { status });
  }
  return new Response(body, { status, headers });
}
