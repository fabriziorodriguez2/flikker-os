import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Prueba de presencia para el check-in — reglas puras, sin acceso a DB.
 *
 * ── El problema real ─────────────────────────────────────────────────────
 * El QR de CHECKIN_V2 es FÍSICO y ESTÁTICO: codifica `/check-in/{token}` con
 * el `VisitSource.token`, que es permanente. Flikker imprime carteles A4 y
 * vende soportes acrílicos de mostrador con QR + NFC, así que ese código no
 * puede "rotar" solo — el chip NFC lleva la misma URL fija.
 *
 * Consecuencia: cualquiera que guarde la URL puede volver a abrirla desde su
 * casa. El dedup actual (8 h entre visitas, 1 visita por día) NO resuelve
 * eso: justamente PERMITE una visita nueva por día, todos los días, desde
 * donde sea. Es una defensa contra el doble escaneo, no contra el replay
 * diario, y tratarla como si fuera lo segundo sería fingir seguridad.
 *
 * ── Lo que sí se puede garantizar ────────────────────────────────────────
 * Una URL estática, sola, no puede probar presencia. Punto. Lo que sí puede
 * hacerse sin cambiar el cartel es exigir un SEGUNDO factor que solo existe
 * dentro del local y que cambia rápido: un código corto y rotativo que el
 * negocio muestra desde algo que ya tiene (el panel de Flikker en el celular
 * del mostrador o una tablet). La URL estática sigue siendo la puerta de
 * entrada; deja de alcanzar por sí sola.
 *
 * ── Por qué HMAC y no una tabla de códigos ───────────────────────────────
 * El código se DERIVA de (businessId, ventana de tiempo, secreto del
 * servidor) — igual que un TOTP. No hay filas que emitir, expirar ni limpiar,
 * el panel y el backend llegan al mismo valor sin coordinarse, y no hay
 * estado nuevo que se pueda desincronizar. El anti-replay sí necesita
 * persistencia, pero vive donde ya está la verdad: el índice único
 * `(businessId, customerId, presenceChallengeId)` de `Visit`.
 *
 * Lo que este mecanismo NO promete, dicho explícitamente: no prueba
 * geolocalización ni impide que un cliente le pase el código por WhatsApp a
 * alguien de afuera dentro de la ventana. Prueba que quien hace check-in
 * tuvo acceso, hace muy poco, a algo que solo se muestra en el local. Es la
 * garantía más fuerte que admite un cartel impreso sin hardware nuevo.
 */

/** Duración de cada ventana. Corto para que un código guardado no sirva mañana. */
export const PRESENCE_WINDOW_SECONDS = 120;

/**
 * Ventanas anteriores que se siguen aceptando. Una sola: cubre al cliente
 * que tipea el código justo cuando rota (y el desfasaje de reloj del
 * dispositivo del mostrador) sin ampliar la validez a algo que se pueda
 * guardar. Máximo real de vida de un código: ~4 minutos.
 */
export const PRESENCE_ACCEPTED_PREVIOUS_WINDOWS = 1;

/** Sin 0/O/1/I/L — mismo alfabeto no ambiguo que los códigos de canje. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export interface PresenceChallenge {
  /** El código que el negocio muestra y el cliente tipea. */
  code: string;
  /**
   * Identidad de ESTA ventana para este negocio. Es lo que se guarda en la
   * `Visit` para que el mismo código no pueda acreditar dos visitas.
   */
  challengeId: string;
  /** Inicio de la ventana (UTC). */
  windowStart: Date;
  /** Fin de la ventana (UTC, exclusivo). */
  windowEnd: Date;
}

function windowIndexOf(now: Date): number {
  return Math.floor(now.getTime() / (PRESENCE_WINDOW_SECONDS * 1000));
}

function digest(secret: string, businessId: string, windowIndex: number) {
  return createHmac('sha256', secret)
    .update(`checkin-presence:v1:${businessId}:${windowIndex}`)
    .digest();
}

function buildChallenge(
  secret: string,
  businessId: string,
  windowIndex: number,
): PresenceChallenge {
  const bytes = digest(secret, businessId, windowIndex);

  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }

  const startMs = windowIndex * PRESENCE_WINDOW_SECONDS * 1000;
  return {
    code,
    // No es el código: es su identidad. Guardar el código en claro en la
    // `Visit` lo volvería reutilizable por quien lea la fila.
    challengeId: bytes.toString('hex').slice(0, 32),
    windowStart: new Date(startMs),
    windowEnd: new Date(startMs + PRESENCE_WINDOW_SECONDS * 1000),
  };
}

/** El desafío vigente ahora mismo — lo que el panel muestra en el mostrador. */
export function currentPresenceChallenge(
  secret: string,
  businessId: string,
  now: Date = new Date(),
): PresenceChallenge {
  return buildChallenge(secret, businessId, windowIndexOf(now));
}

export type PresenceVerification =
  | { valid: true; challenge: PresenceChallenge }
  | { valid: false; reason: 'malformed' | 'expired' };

/**
 * Verifica un código contra la ventana actual y las aceptadas hacia atrás.
 *
 * Comparación en tiempo constante: el código es corto y adivinable por
 * fuerza bruta si se filtra por timing. El rate limiting vive en el
 * controller (`ThrottlerGuard`), que es donde ya vive para recuperación.
 */
export function verifyPresenceCode(
  secret: string,
  businessId: string,
  rawCode: string,
  now: Date = new Date(),
): PresenceVerification {
  const code = rawCode?.trim().toUpperCase() ?? '';
  if (code.length !== CODE_LENGTH) return { valid: false, reason: 'malformed' };

  const current = windowIndexOf(now);
  for (let back = 0; back <= PRESENCE_ACCEPTED_PREVIOUS_WINDOWS; back += 1) {
    const challenge = buildChallenge(secret, businessId, current - back);
    const a = Buffer.from(challenge.code);
    const b = Buffer.from(code);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { valid: true, challenge };
    }
  }

  return { valid: false, reason: 'expired' };
}
