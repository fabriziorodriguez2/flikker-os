/**
 * Valida que un `next` recibido por query string (ej. `/login?next=...`) sea
 * una ruta interna segura antes de usarlo en un `router.push`/redirect —
 * evita open-redirect si alguien manda `next=https://evil.com`,
 * `next=//evil.com`, `next=javascript:...` o variantes con backslash
 * (`/\evil.com`) que algunos parsers normalizan a "//evil.com".
 *
 * Devuelve la ruta tal cual si es segura, o `null` si no lo es — el caller
 * decide el fallback (ej. "/dashboard").
 */
export function getSafeInternalPath(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Caracteres de control (tabs, saltos de línea, etc.) — algunos parsers de
  // URL los ignoran al resolver, lo que podría convertir un valor que hoy
  // parece inofensivo en un esquema o host distinto más adelante.
  if (/[\x00-\x1f]/.test(raw)) return null;

  // Debe ser una ruta absoluta-de-sitio ("/algo"), nunca un esquema
  // (http:, https:, javascript:, mailto:, etc. no empiezan con "/").
  if (!raw.startsWith("/")) return null;

  // "//host" (protocol-relative) y variantes con backslash ("/\host",
  // "\host") son el bypass clásico de un check ingenuo de "empieza con /".
  if (raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("\\")) {
    return null;
  }

  // Chequeo final por resolución real de URL: si el origin resultante de
  // resolver `raw` contra un origin fijo cambia, es que en algún punto se
  // interpretó como absoluta o protocol-relative (WHATWG normaliza "\" como
  // "/" para esquemas especiales, por eso el check de arriba no alcanza
  // solo). Esto es lo que de verdad garantiza que nunca salga del sitio.
  try {
    const base = "https://flikker-internal.invalid";
    const resolved = new URL(raw, base);
    if (resolved.origin !== base) return null;
  } catch {
    return null;
  }

  return raw;
}
