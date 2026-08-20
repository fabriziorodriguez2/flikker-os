import { Injectable } from '@nestjs/common';
import { MessageStatus, RetentionStrategyType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EXPOSED_STATUSES } from './exposure';
import { RECOVERY_OBJECTIVES } from './retention-v2-bootstrap-plan';
import {
  computeReactivationFunnel,
  type FunnelCounts,
  type ReactivationFunnelResult,
} from './reactivation-funnel';

const BENEFIT_STRATEGY_TYPES: RetentionStrategyType[] = [
  RetentionStrategyType.SOFT_BENEFIT,
  RetentionStrategyType.STRONG_BENEFIT,
];

/**
 * Estados reales de `Message` (los que `RetentionV2MessageDispatchService`
 * escribe después de llamar de verdad a WhatsApp) que cuentan como "salió
 * por el canal". `EXPOSED_STATUSES` en `RetentionAssignment` es
 * intention-to-treat a propósito (se fija en `SENT` al CREAR el `Message`,
 * nunca se sincroniza con el resultado real del dispatch — ver
 * `exposure.ts`) — correcto para las métricas de experimento, pero este KPI
 * de cara al dueño pide algo más estricto: nunca contar un mensaje que
 * quedó `queued`/`sending`/`failed`.
 */
const CONFIRMED_SENT_MESSAGE_STATUSES: MessageStatus[] = [
  MessageStatus.sent,
  MessageStatus.delivered,
  MessageStatus.read,
];

/**
 * "X contactados → Y volvieron → Z% de recuperación" para Retención/
 * Reactivación — nunca para `REWARD_GOAL_PROGRESS` (esa es la tarjeta de
 * sellos, otra cosa). Reusa la atribución que `RetentionOutcomeService` ya
 * calculó (Visit real vs. `exposedAt`, dentro de `attributionWindowDays`) —
 * este servicio solo agrega lo que ya existe, nunca vuelve a decidir si
 * alguien "volvió".
 *
 * `CONTROL` se excluye siempre: no recibió nada, así que no es "contactado".
 */
@Injectable()
export class ReactivationFunnelService {
  constructor(private readonly prisma: PrismaService) {}

  async forBusiness(businessId: string): Promise<ReactivationFunnelResult> {
    const [settings, assignments] = await Promise.all([
      this.prisma.retentionSettings.findUnique({
        where: { businessId },
        select: { minimumSampleSizeForRecommendations: true },
      }),
      this.prisma.retentionAssignment.findMany({
        where: {
          businessId,
          status: { in: EXPOSED_STATUSES },
          experiment: { objective: { in: RECOVERY_OBJECTIVES } },
          variant: { strategyType: { not: RetentionStrategyType.CONTROL } },
          // El filtro real de "contactado" para este KPI — un `message` nulo
          // (nunca debería pasar acá, CONTROL ya está excluido) o en
          // `queued`/`sending`/`failed` no cuenta.
          message: { status: { in: CONFIRMED_SENT_MESSAGE_STATUSES } },
        },
        select: {
          variant: { select: { strategyType: true } },
          outcome: { select: { returned: true, daysToReturn: true } },
        },
      }),
    ]);
    const minimumSampleSize =
      settings?.minimumSampleSizeForRecommendations ?? 30;

    const overall = emptyCounts();
    const reminderOnly = emptyCounts();
    const withBenefit = emptyCounts();

    for (const assignment of assignments) {
      const bucket = BENEFIT_STRATEGY_TYPES.includes(
        assignment.variant.strategyType,
      )
        ? withBenefit
        : reminderOnly; // REMINDER — el único otro strategyType posible acá, ya que CONTROL está excluido por el `where`.

      addAssignment(overall, assignment.outcome);
      addAssignment(bucket, assignment.outcome);
    }

    return computeReactivationFunnel(
      overall,
      reminderOnly,
      withBenefit,
      minimumSampleSize,
    );
  }
}

function emptyCounts(): FunnelCounts {
  return { contacted: 0, returned: 0, daysToReturnSamples: [] };
}

function addAssignment(
  counts: FunnelCounts,
  outcome: { returned: boolean; daysToReturn: number | null } | null,
): void {
  counts.contacted += 1;
  if (outcome?.returned) {
    counts.returned += 1;
    if (outcome.daysToReturn !== null) {
      counts.daysToReturnSamples.push(outcome.daysToReturn);
    }
  }
}
