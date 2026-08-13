import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MembershipRole,
  RetentionObjective,
  RewardGoalStatus,
} from '@prisma/client';
import { computeVisitFrequency } from '../../retention-v2/visit-frequency';
import { segmentCustomer } from '../../retention-v2/segmentation';
import { computeGoalProgress } from '../../reward-goals/reward-goal-progress';
import { CustomerLoyaltyRepository } from './customer-loyalty.repository';
// Mapping compartido con el historial de Notificaciones: los dos lados
// tienen que llamar igual al mismo mensaje.
import {
  messageKindOf,
  type MessageKind,
} from '../../notifications/message-kind';
import {
  approximateCadencePhrase,
  recurrenceKeyFor,
  type RecurrenceKey,
} from './recurrence';

/**
 * El detalle de un cliente, en una sola llamada.
 *
 * La pantalla cuenta una historia: qué tarjeta tiene ahora, cuánto vino,
 * qué le pasó y qué le mandamos. Resolverlo desde el browser serían siete
 * requests encadenados, así que se agrega acá.
 *
 * Tenancy — la regla que gobierna todo el archivo: el negocio ve SU relación
 * con este cliente. Aunque el `Customer` esté vinculado a un `FlikkerAccount`
 * global (y por lo tanto exista "el mismo" cliente en otro negocio), acá no
 * se navega ese vínculo: cada query lleva `businessId`, y el id que llega por
 * la URL solo resuelve si pertenece a este negocio. Un cliente de otro negocio
 * da 404, no un 403 — no confirmamos que exista.
 */

export type TimelineKind =
  | 'registro'
  | 'visita'
  | 'feedback'
  | 'desbloqueo'
  | 'canje'
  | 'mensaje';

/** Qué sumó el evento a la tarjeta. `null` = no sumó nada. */
export type StampKind = 'visita' | 'bonus' | null;

/** Cuanto más alto, más tarde ocurre dentro del mismo instante. */
const CAUSAL_ORDER: Record<TimelineKind, number> = {
  registro: 0,
  mensaje: 1,
  visita: 2,
  feedback: 3,
  desbloqueo: 4,
  canje: 5,
};

export interface TimelineEvent {
  at: Date;
  kind: TimelineKind;
  stamp: StampKind;
  /** Nombre de la recompensa, en desbloqueo/canje. */
  rewardName?: string;
  /** Puntaje y comentario, en feedback. */
  score?: number;
  comment?: string | null;
  messageKind?: MessageKind;
}

@Injectable()
export class CustomerOverviewService {
  constructor(private readonly repository: CustomerLoyaltyRepository) {}

  async overview(
    businessId: string,
    customerId: string,
    role?: MembershipRole,
    now: Date = new Date(),
  ) {
    const customer = await this.repository.findCustomer(businessId, customerId);
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const [visits, goals, feedback, messages, lastSends] = await Promise.all([
      this.repository.findCustomerVisits(businessId, customerId),
      this.repository.findCustomerGoals(businessId, customerId),
      this.repository.findCustomerFeedback(businessId, customerId),
      this.repository.findCustomerMessages(businessId, customerId),
      this.repository.findLastInterventionAt(businessId),
    ]);

    const visitDates = visits.map((v) => v.occurredAt);
    const frequency = computeVisitFrequency(visitDates, now);
    const { segment } = segmentCustomer({
      frequency,
      lastInterventionAt: lastSends.get(customerId) ?? null,
      now,
    });

    const bonusByGoal = await this.repository.countBonusStampsByGoal(
      businessId,
      goals.map((g) => g.id),
    );

    /** Sellos de una tarjeta: visitas dentro de su ventana + bonus. */
    const progressOf = (goal: (typeof goals)[number]) => {
      const closedAt = goal.unlockedAt ?? goal.cancelledAt ?? null;
      const visitProgress = visitDates.filter(
        (d) =>
          d.getTime() > goal.activatedAt.getTime() &&
          (closedAt === null || d.getTime() <= closedAt.getTime()),
      ).length;
      return computeGoalProgress({
        visitProgress,
        bonusStamps: bonusByGoal.get(goal.id) ?? 0,
        targetAdditionalVisits: goal.targetAdditionalVisits,
      });
    };

    const activeGoal = goals.find((g) => g.status === RewardGoalStatus.ACTIVE);
    const unlockedGoal = goals.find(
      (g) => g.status === RewardGoalStatus.UNLOCKED,
    );

    // Historial: TODA tarjeta que ya no está en curso se conserva como un
    // ciclo aparte, con sus propios sellos. Una tarjeta vieja no se "resetea"
    // visualmente cuando arranca la siguiente.
    const history = goals
      .filter((g) => g.status !== RewardGoalStatus.ACTIVE)
      .map((goal) => {
        const progress = progressOf(goal);
        return {
          id: goal.id,
          rewardName: goal.incentiveDefinition.name,
          status: goal.status,
          progressVisits: progress.progressVisits,
          targetAdditionalVisits: progress.targetAdditionalVisits,
          unlockedAt: goal.unlockedAt,
          redeemedAt:
            goal.redeemedAt ?? goal.benefitParticipation?.redeemedAt ?? null,
          expiresAt: goal.expiresAt,
        };
      });

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: maskPhone(customer.phoneE164, role),
        createdAt: customer.createdAt,
        optedOut: customer.optedOut,
      },

      summary: {
        // Visitas y sellos son cosas distintas y se devuelven por separado a
        // propósito: 3 visitas con 4 sellos es un estado normal y correcto
        // (el feedback puede sumar uno), no un error de cuentas.
        visitCount: frequency.visitCount,
        firstVisitAt: frequency.firstVisitAt,
        lastVisitAt: frequency.lastVisitAt,
        feedbackCount: feedback.length,
        rewardsRedeemed: goals.filter(
          (g) => g.status === RewardGoalStatus.REDEEMED,
        ).length,
        recurrence: recurrenceKeyFor({ segment, frequency }),
        // `null` si el cliente no tiene historial suficiente. Preferimos no
        // decir nada antes que inventar una frecuencia con una sola visita.
        cadencePhrase: approximateCadencePhrase(frequency),
      },

      /** Tarjeta en curso, o la recompensa esperando ser canjeada. */
      currentCard: activeGoal
        ? {
            state: 'en_progreso' as const,
            rewardName: activeGoal.incentiveDefinition.name,
            ...progressOf(activeGoal),
          }
        : unlockedGoal
          ? {
              state: 'disponible' as const,
              rewardName: unlockedGoal.incentiveDefinition.name,
              ...progressOf(unlockedGoal),
              unlockedAt: unlockedGoal.unlockedAt,
            }
          : null,

      history,

      feedback: feedback.map((f) => ({
        id: f.id,
        score: f.score,
        // Sin comentario se devuelve null y la UI muestra solo las estrellas.
        // Nunca se inventa un texto.
        comment: f.comment,
        createdAt: f.createdAt,
        gaveBonusStamp: f.bonusStamp !== null,
      })),

      notifications: messages.map((m) => ({
        id: m.id,
        at: m.sentAt ?? m.createdAt,
        kind: messageKindOf(m.retentionAssignment?.experiment.objective),
        delivered: m.sentAt !== null,
      })),

      timeline: this.buildTimeline({
        customerCreatedAt: customer.createdAt,
        visits,
        goals,
        feedback,
        messages,
      }),
    };
  }

  /**
   * Mezcla las fuentes reales en una sola línea de tiempo, más reciente
   * primero. No se inventa ningún evento: cada entrada corresponde a una fila
   * que existe en la base.
   */
  private buildTimeline(input: {
    customerCreatedAt: Date;
    visits: { id: string; occurredAt: Date }[];
    goals: {
      activatedAt: Date;
      unlockedAt: Date | null;
      cancelledAt: Date | null;
      redeemedAt: Date | null;
      incentiveDefinition: { name: string };
      benefitParticipation: { redeemedAt: Date | null } | null;
    }[];
    feedback: {
      score: number;
      comment: string | null;
      createdAt: Date;
      bonusStamp: { id: string } | null;
    }[];
    messages: {
      sentAt: Date | null;
      createdAt: Date;
      retentionAssignment: {
        experiment: { objective: RetentionObjective };
      } | null;
    }[];
  }): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    events.push({
      at: input.customerCreatedAt,
      kind: 'registro',
      stamp: null,
    });

    for (const visit of input.visits) {
      // Una visita suma sello solo si cayó dentro de la ventana activa de
      // alguna tarjeta. Antes de la primera tarjeta, o después de haberla
      // desbloqueado, la visita es real pero no sumó nada.
      const countedTowardCard = input.goals.some((goal) => {
        const closedAt = goal.unlockedAt ?? goal.cancelledAt;
        return (
          visit.occurredAt.getTime() > goal.activatedAt.getTime() &&
          (closedAt === null ||
            visit.occurredAt.getTime() <= closedAt.getTime())
        );
      });
      events.push({
        at: visit.occurredAt,
        kind: 'visita',
        stamp: countedTowardCard ? 'visita' : null,
      });
    }

    for (const f of input.feedback) {
      events.push({
        at: f.createdAt,
        kind: 'feedback',
        // El sello extra es del feedback, no de una visita nueva.
        stamp: f.bonusStamp ? 'bonus' : null,
        score: f.score,
        comment: f.comment,
      });
    }

    for (const goal of input.goals) {
      if (goal.unlockedAt) {
        events.push({
          at: goal.unlockedAt,
          kind: 'desbloqueo',
          stamp: null,
          rewardName: goal.incentiveDefinition.name,
        });
      }
      const redeemedAt =
        goal.redeemedAt ?? goal.benefitParticipation?.redeemedAt;
      if (redeemedAt) {
        events.push({
          at: redeemedAt,
          kind: 'canje',
          stamp: null,
          rewardName: goal.incentiveDefinition.name,
        });
      }
    }

    for (const m of input.messages) {
      events.push({
        at: m.sentAt ?? m.createdAt,
        kind: 'mensaje',
        stamp: null,
        messageKind: messageKindOf(m.retentionAssignment?.experiment.objective),
      });
    }

    // Más reciente arriba. El desempate importa de verdad: una visita y su
    // feedback pueden quedar registrados en el mismo instante, y sin criterio
    // fijo la timeline se ordenaría distinto en cada request. Ante empate gana
    // el evento que sucede DESPUÉS en la cadena causal — primero visitás,
    // después dejás feedback; primero desbloqueás, después canjeás.
    return events.sort(
      (a, b) =>
        b.at.getTime() - a.at.getTime() ||
        CAUSAL_ORDER[b.kind] - CAUSAL_ORDER[a.kind],
    );
  }
}

function maskPhone(phoneE164: string, role?: MembershipRole): string {
  if (role === MembershipRole.OWNER || role === MembershipRole.ADMIN) {
    return phoneE164;
  }
  if (phoneE164.length <= 4) return phoneE164;
  return `••••${phoneE164.slice(-4)}`;
}

export type { RecurrenceKey, MessageKind };
