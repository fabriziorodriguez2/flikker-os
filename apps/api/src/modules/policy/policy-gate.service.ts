import { Injectable, Logger } from '@nestjs/common';
import {
  PolicyReservation,
  PolicyReservationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { DECISION_CODES } from '../retention-v2/retention-decision-log.service';
import {
  AUTO_PAUSE,
  RESERVATION_TTL_MS,
  autoPauseReason,
  evaluatePolicy,
  type PolicyDecision,
  type PolicyEffect,
} from './policy-rules';
import { loadUsage, monthKey, weekKey } from './policy-usage';
import { PolicyService } from './policy.service';

export type GateOutcome =
  /** El negocio no aceptó la política y el efecto no es de Intelligence: camino de siempre. */
  | { status: 'NOT_GOVERNED' }
  | { status: 'DENIED'; decision: PolicyDecision }
  | {
      status: 'RESERVED';
      decision: PolicyDecision;
      reservation: PolicyReservation;
    }
  /** Misma clave, ya confirmada: devolver el resultado guardado, no repetir. */
  | { status: 'REPLAY'; reservation: PolicyReservation }
  /** Misma clave, todavía en vuelo (doble click, reintento concurrente). */
  | { status: 'IN_PROGRESS'; reservation: PolicyReservation };

export interface GateRequest {
  businessId: string;
  effect: PolicyEffect;
  now?: Date;
  /** Mensaje de Autopilot que se está despachando: no cuenta contra sí mismo. */
  excludeMessageId?: string;
}

/**
 * La única puerta para producir un efecto gobernado. Todo pasa por acá, en
 * el servidor, con datos leídos de la base: lo que diga el modelo o la UI
 * no cambia ningún número. `reserve` toma el advisory lock del negocio, así
 * que dos efectos concurrentes se ven entre sí y nunca pasan juntos un tope.
 */
@Injectable()
export class PolicyGateService {
  private readonly logger = new Logger(PolicyGateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
    private readonly audit: AuditService,
  ) {}

  /** Dry-run: la misma decisión, sin lock ni reserva. */
  async evaluate(
    req: GateRequest,
  ): Promise<{ governed: boolean; decision: PolicyDecision }> {
    const now = req.now ?? new Date();
    const { config, averageTicketAmount } = await this.policies.getConfig(
      req.businessId,
    );
    const usage = await loadUsage(this.prisma, {
      businessId: req.businessId,
      timezone: config.businessTimezone,
      now,
      candidates: req.effect.candidateCustomerIds,
      messageUnitCost: config.messageUnitCost,
      averageTicketAmount,
      excludeMessageId: req.excludeMessageId,
    });
    return {
      governed:
        req.effect.source === 'INTELLIGENCE' || Boolean(config.acceptedAt),
      decision: evaluatePolicy({ config, effect: req.effect, usage, now }),
    };
  }

  async reserve(
    req: GateRequest,
    meta: {
      idempotencyKey: string;
      userId: string | null;
      sourceRef?: string | null;
    },
  ): Promise<GateOutcome> {
    const now = req.now ?? new Date();
    const { businessId, effect } = req;

    const outcome = await this.prisma.$transaction(
      async (tx): Promise<GateOutcome> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`policy:${businessId}`}))`;
        // Caducidad: una reserva que nadie confirmó deja de contar.
        await tx.policyReservation.updateMany({
          where: {
            businessId,
            status: PolicyReservationStatus.HELD,
            expiresAt: { lte: now },
          },
          data: { status: PolicyReservationStatus.EXPIRED },
        });

        const existing = await tx.policyReservation.findUnique({
          where: {
            businessId_idempotencyKey: {
              businessId,
              idempotencyKey: meta.idempotencyKey,
            },
          },
        });
        if (existing?.status === PolicyReservationStatus.COMMITTED) {
          return { status: 'REPLAY', reservation: existing };
        }
        if (existing?.status === PolicyReservationStatus.HELD) {
          return { status: 'IN_PROGRESS', reservation: existing };
        }

        const { config, averageTicketAmount } = await this.policies.getConfig(
          businessId,
          tx,
        );
        if (effect.source !== 'INTELLIGENCE' && !config.acceptedAt) {
          return { status: 'NOT_GOVERNED' };
        }

        const usage = await loadUsage(tx, {
          businessId,
          timezone: config.businessTimezone,
          now,
          candidates: effect.candidateCustomerIds,
          messageUnitCost: config.messageUnitCost,
          averageTicketAmount,
          excludeMessageId: req.excludeMessageId,
        });
        const decision = evaluatePolicy({ config, effect, usage, now });
        if (!decision.allowed) return { status: 'DENIED', decision };

        const data = {
          source: effect.source,
          sourceRef: meta.sourceRef ?? null,
          status: PolicyReservationStatus.HELD,
          monthKey: monthKey(now, config.businessTimezone),
          weekKey: weekKey(now, config.businessTimezone),
          currency: decision.cost.currency,
          messageCount:
            effect.kind === 'MESSAGE' ? decision.eligibleCustomerIds.length : 0,
          messagingAmount: decision.cost.messaging,
          incentiveCount: effect.incentive
            ? decision.eligibleCustomerIds.length
            : 0,
          incentiveAmount: decision.cost.incentives,
          customerIds: decision.eligibleCustomerIds,
          createsCampaign: effect.createsCampaign,
          createdByUserId: meta.userId,
          expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
          committedAt: null,
          releasedAt: null,
          result: Prisma.DbNull,
        };
        // Una clave liberada o vencida se puede volver a usar: es el mismo
        // efecto lógico (p. ej. el reintento de un mensaje de Autopilot).
        const reservation = existing
          ? await tx.policyReservation.update({
              where: { id: existing.id },
              data,
            })
          : await tx.policyReservation.create({
              data: {
                ...data,
                businessId,
                idempotencyKey: meta.idempotencyKey,
              },
            });
        return { status: 'RESERVED', decision, reservation };
      },
      { timeout: 20_000 },
    );

    if (outcome.status === 'DENIED' || outcome.status === 'RESERVED') {
      await this.audit.log({
        action:
          outcome.status === 'DENIED' ? 'POLICY_DENIED' : 'POLICY_RESERVED',
        entityType: 'PolicyReservation',
        entityId:
          outcome.status === 'RESERVED'
            ? outcome.reservation.id
            : meta.idempotencyKey,
        userId: meta.userId,
        businessId,
        metadata: {
          source: effect.source,
          kind: effect.kind,
          sourceRef: meta.sourceRef ?? null,
          blockers: outcome.decision.blockers.map((b) => b.code),
          candidates: effect.candidateCustomerIds.length,
          eligible: outcome.decision.eligibleCustomerIds.length,
          excluded: summarizeExclusions(outcome.decision),
          cost: outcome.decision.cost,
        },
      });
    }
    return outcome;
  }

  /**
   * Confirma con lo que realmente salió (conciliación): si se mandaron menos
   * mensajes o se emitieron menos premios, la diferencia vuelve a la bolsa.
   * Acepta una reserva vencida: el efecto ya ocurrió y tiene que quedar
   * registrado igual.
   */
  async commit(
    reservationId: string,
    actual: {
      messagesSent: number;
      incentivesIssued: number;
      sourceRef?: string | null;
      result?: Record<string, unknown>;
    },
  ): Promise<void> {
    const reservation = await this.prisma.policyReservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation) return;
    const unit = (amount: Prisma.Decimal, count: number) =>
      count > 0 ? Number(amount) / count : 0;
    const messagingAmount =
      Math.round(
        unit(reservation.messagingAmount, reservation.messageCount) *
          actual.messagesSent *
          100,
      ) / 100;
    const incentiveAmount =
      Math.round(
        unit(reservation.incentiveAmount, reservation.incentiveCount) *
          actual.incentivesIssued *
          100,
      ) / 100;
    const claim = await this.prisma.policyReservation.updateMany({
      where: {
        id: reservationId,
        status: {
          in: [PolicyReservationStatus.HELD, PolicyReservationStatus.EXPIRED],
        },
      },
      data: {
        status: PolicyReservationStatus.COMMITTED,
        committedAt: new Date(),
        messageCount: actual.messagesSent,
        messagingAmount,
        incentiveCount: actual.incentivesIssued,
        incentiveAmount,
        ...(actual.sourceRef ? { sourceRef: actual.sourceRef } : {}),
        ...(actual.result
          ? { result: actual.result as Prisma.InputJsonValue }
          : {}),
      },
    });
    if (claim.count === 0) return;
    await this.audit.log({
      action: 'POLICY_COMMITTED',
      entityType: 'PolicyReservation',
      entityId: reservationId,
      userId: reservation.createdByUserId,
      businessId: reservation.businessId,
      metadata: {
        reserved: {
          messages: reservation.messageCount,
          messaging: Number(reservation.messagingAmount),
          incentives: reservation.incentiveCount,
          incentiveAmount: Number(reservation.incentiveAmount),
        },
        actual: {
          messages: actual.messagesSent,
          messaging: messagingAmount,
          incentives: actual.incentivesIssued,
          incentiveAmount,
        },
      },
    });
  }

  /** El efecto no ocurrió: la reserva deja de contar. */
  async release(reservationId: string, reason: string): Promise<void> {
    const reservation = await this.prisma.policyReservation.findUnique({
      where: { id: reservationId },
      select: { businessId: true, createdByUserId: true },
    });
    if (!reservation) return;
    const claim = await this.prisma.policyReservation.updateMany({
      where: { id: reservationId, status: PolicyReservationStatus.HELD },
      data: {
        status: PolicyReservationStatus.RELEASED,
        releasedAt: new Date(),
      },
    });
    if (claim.count === 0) return;
    await this.audit.log({
      action: 'POLICY_RELEASED',
      entityType: 'PolicyReservation',
      entityId: reservationId,
      userId: reservation.createdByUserId,
      businessId: reservation.businessId,
      metadata: { reason },
    });
  }

  /**
   * Pausa automática ante errores de envío, bajas o quejas de los últimos 7
   * días. Solo para negocios con la política aceptada; nunca reanuda sola.
   */
  async checkHealth(
    businessId: string,
    now: Date = new Date(),
  ): Promise<string | null> {
    try {
      const policy = await this.prisma.businessPolicy.findUnique({
        where: { businessId },
        select: { acceptedAt: true, paused: true },
      });
      if (!policy?.acceptedAt || policy.paused) return null;
      const since = new Date(
        now.getTime() - AUTO_PAUSE.windowDays * 86_400_000,
      );
      const [sent, failed, retentionFailed, optOuts, complaints, contacted] =
        await Promise.all([
          this.prisma.manualCampaignContact.count({
            where: { businessId, status: 'sent', sentAt: { gte: since } },
          }),
          this.prisma.manualCampaignContact.count({
            where: { businessId, status: 'failed', createdAt: { gte: since } },
          }),
          this.prisma.retentionDecisionLog.count({
            where: {
              businessId,
              decisionCode: DECISION_CODES.MESSAGE_SEND_FAILED,
              createdAt: { gte: since },
            },
          }),
          this.prisma.customerConsentEvent.count({
            where: {
              businessId,
              channel: 'WHATSAPP',
              action: 'REVOKED',
              source: { in: ['INBOUND_KEYWORD', 'STAFF'] },
              createdAt: { gte: since },
            },
          }),
          this.prisma.customerConsentEvent.count({
            where: {
              businessId,
              action: 'SUPPRESSED',
              source: 'COMPLAINT',
              createdAt: { gte: since },
            },
          }),
          this.prisma.manualCampaignContact.findMany({
            where: {
              businessId,
              status: 'sent',
              sentAt: { gte: since },
              customerId: { not: null },
            },
            select: { customerId: true },
            distinct: ['customerId'],
          }),
        ]);
      const metrics = {
        sent,
        failed: failed + retentionFailed,
        optOuts,
        complaints,
        contacted: contacted.length,
      };
      const reason = autoPauseReason(metrics);
      if (!reason) return null;
      await this.policies.pause(businessId, null, reason, { metrics });
      return reason;
    } catch (error) {
      // Una falla al medir no puede tirar el envío que ya ocurrió.
      this.logger.warn(
        `Policy health check failed for ${businessId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}

export function summarizeExclusions(
  decision: PolicyDecision,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of decision.excluded) {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1;
  }
  return counts;
}

/** Un único texto para el dueño a partir de los bloqueos. */
export function denialMessage(decision: PolicyDecision): string {
  const messages = [...new Set(decision.blockers.map((b) => b.message))];
  return `La política de tu negocio no permite este envío: ${messages.join(' ')}`;
}
