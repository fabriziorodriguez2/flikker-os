/**
 * Validación de la URL de la ficha de Google que pega el dueño.
 *
 * Todavía no hay Places API, así que esto NO resuelve ni verifica la ficha:
 * solo evita guardar basura que después falle en silencio.
 *
 * El criterio es deliberadamente permisivo. Google reparte links de una ficha
 * en muchas formas distintas y todas son legítimas: `maps.app.goo.gl/xxx`,
 * `g.page/negocio`, `goo.gl/maps/xxx`, `google.com/maps/place/...`,
 * `google.com.uy/maps/...`, `search.google.com/local/writereview?placeid=...`.
 * Una regex "prolija" que exija `/maps/place/` rechazaría la mayoría de los
 * links que el dueño realmente tiene a mano — que es exactamente el caso que
 * el paso tiene que soportar. Por eso solo se exige: URL parseable, https, y
 * host de Google.
 */

/** Hosts aceptados. Se compara sufijo para cubrir `www.` y los ccTLD (.com.uy). */
const GOOGLE_HOSTS = [
  'google.com',
  'goo.gl',
  'g.page',
  'maps.app.goo.gl',
  'google.page.link',
];

export class GoogleUrlError extends Error {}

/**
 * Devuelve la URL normalizada, o `null` si vino vacía ("configurar más tarde").
 * Lanza `GoogleUrlError` con un mensaje explicable si no sirve.
 */
export function normalizeGoogleBusinessUrl(
  raw: string | undefined | null,
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  // Sin esquema es lo que más pega la gente: `g.page/mi-negocio`. Se asume
  // https en vez de rechazarlo.
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new GoogleUrlError(
      'Ese link no parece una dirección web. Copialo desde Google Maps con el botón Compartir.',
    );
  }

  if (url.protocol !== 'https:') {
    throw new GoogleUrlError('El link tiene que empezar con https://');
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const isGoogle = GOOGLE_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
  // `google.com.uy` y demás ccTLD no terminan en ninguno de los de arriba.
  const isGoogleCcTld = /(^|\.)google\.[a-z.]{2,8}$/.test(host);

  if (!isGoogle && !isGoogleCcTld) {
    throw new GoogleUrlError(
      'Ese link no es de Google. Buscá tu negocio en Google Maps, tocá Compartir y pegá ese link.',
    );
  }

  return url.toString();
}
