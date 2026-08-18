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
  | 'sellos_por_vencer'
  | 'cumpleanos'
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

/**
 * Misma traducción que `messageKindOf`, para el otro origen de historial:
 * `EmailLog.kind` (ver `LifecycleEmailKind` en `lifecycle-emails.service.ts`).
 * `stamps_expiry` y `birthday` no tienen equivalente en `RetentionObjective`
 * porque no son Retention V2 — son las dos automatizaciones de email que no
 * pasan por ahí.
 */
export function emailMessageKindOf(kind: string): MessageKind {
  switch (kind) {
    case 'stamps_expiry':
      return 'sellos_por_vencer';
    case 'progress_reminder':
      return 'recordatorio_progreso';
    case 'reactivation':
      return 'invitacion_volver';
    case 'birthday':
      return 'cumpleanos';
    case 'promotion':
      return 'promocion';
    default:
      return 'otro';
  }
}
