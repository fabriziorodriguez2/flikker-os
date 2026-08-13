import { RetentionObjective } from '@prisma/client';

/**
 * La ÚNICA traducción de "qué mensaje es éste" hacia el panel.
 *
 * Vive sola en su archivo porque la usan dos pantallas — el detalle de un
 * cliente y el historial de Notificaciones — y el pedido es explícito: las
 * dos tienen que llamar a las cosas igual. Si cada una mapeara por su cuenta,
 * el mismo mensaje aparecería como "Recordatorio de progreso" en un lado y
 * como otra cosa en el otro.
 *
 * También es la frontera con Retention V2: `RetentionObjective` entra acá y
 * no sale. Ni objetivo, ni experimento, ni variante, ni CONTROL, ni
 * allocation cruzan hacia el frontend.
 */
export type MessageKind =
  | 'recordatorio_progreso'
  | 'invitacion_volver'
  | 'promocion'
  | 'otro';

export function messageKindOf(objective?: RetentionObjective): MessageKind {
  if (objective === RetentionObjective.REWARD_GOAL_PROGRESS) {
    return 'recordatorio_progreso';
  }
  if (
    objective === RetentionObjective.AT_RISK_RECOVERY ||
    objective === RetentionObjective.INACTIVE_RECOVERY ||
    objective === RetentionObjective.SECOND_VISIT
  ) {
    return 'invitacion_volver';
  }
  return 'otro';
}
