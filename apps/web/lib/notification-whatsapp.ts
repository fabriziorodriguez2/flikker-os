/**
 * Lógica pura detrás de `useNotificationWhatsApp` — separada para poder
 * probarla sin un DOM, igual que `pro-checkout.ts`.
 */

export const NOTIFICATION_WHATSAPP_GENERIC_ERROR =
  "No pudimos guardar tu WhatsApp. Probá de nuevo.";

/** El body exacto que viaja al backend — dígitos nacionales, prefijo +598 fijo. */
export function buildNotificationWhatsAppRequestBody(nationalDigits: string): {
  phone: string;
} {
  return { phone: `+598${nationalDigits}` };
}

/** Mensaje a mostrar cuando el PATCH falla — nunca un error técnico crudo. */
export function parseNotificationWhatsAppError(data: unknown): string {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof (data as Record<string, unknown>).message === "string"
  ) {
    return (data as Record<string, unknown>).message as string;
  }
  return NOTIFICATION_WHATSAPP_GENERIC_ERROR;
}
