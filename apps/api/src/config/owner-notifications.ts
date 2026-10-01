/**
 * Contacto del EQUIPO de Flikker (no el dueño de un Business) — a dónde
 * llegan las notificaciones internas de registro/pago nuevo (Parte 5).
 *
 * Centralizado acá a propósito: antes de esto no existía ningún concepto
 * de "notificar al equipo interno" en el repo (todo lo que decía "owner"
 * era el dueño del Business). Sin esto, cada call-site terminaría con el
 * teléfono/email de Flikker hardcodeado repetido por el código — justo lo
 * que esto evita.
 *
 * Sin default: si falta, esa notificación específica simplemente no se
 * manda (se loguea y se sigue) — nunca se inventa un contacto de respaldo.
 */

export function getFlikkerOwnerNotificationPhone(): string | undefined {
  return process.env.FLIKKER_OWNER_NOTIFICATION_PHONE || undefined;
}

export function getFlikkerOwnerNotificationEmail(): string | undefined {
  return process.env.FLIKKER_OWNER_NOTIFICATION_EMAIL || undefined;
}

/**
 * Link a "Primeros pasos con Flikker" (Parte 5, §16) — un asset estático y
 * versionado, NO generado dinámicamente por cliente. Sin default: si falta,
 * el mensaje de bienvenida Pro simplemente omite ese link en vez de mandar
 * uno roto.
 */
export function getGettingStartedPdfUrl(): string | undefined {
  return process.env.FLIKKER_GETTING_STARTED_PDF_URL || undefined;
}
