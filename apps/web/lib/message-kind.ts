/**
 * Cómo se llama cada tipo de mensaje EN TODA la app.
 *
 * Existe un solo lugar a propósito: el detalle de un cliente y el historial de
 * Notificaciones muestran los mismos mensajes, y tienen que llamarlos igual.
 * Si cada pantalla tuviera su propio diccionario, el mismo envío aparecería
 * como "Recordatorio de progreso" en una y como otra cosa en la otra.
 *
 * Las claves las produce el backend (`message-kind.ts` del lado de la API),
 * que es donde `RetentionObjective` se traduce y se queda. Acá solo se decide
 * cómo se dice en español.
 */
export type MessageKind =
  | "recordatorio_progreso"
  | "invitacion_volver"
  | "promocion"
  | "otro";

/** Frase en pasado, como aparece en la timeline de un cliente. */
export const MESSAGE_LABEL: Record<MessageKind, string> = {
  recordatorio_progreso: "Recordatorio de progreso enviado",
  invitacion_volver: "Mensaje para volver enviado",
  promocion: "Promoción enviada",
  otro: "Mensaje enviado",
};

/** Nombre del tipo, como aparece en una columna o un chip del historial. */
export const MESSAGE_TYPE_LABEL: Record<MessageKind, string> = {
  recordatorio_progreso: "Recordatorio de progreso",
  invitacion_volver: "Mensaje para volver",
  promocion: "Promoción",
  otro: "Mensaje",
};
