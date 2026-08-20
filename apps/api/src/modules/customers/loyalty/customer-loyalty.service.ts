import { Injectable } from '@nestjs/common';
import { CustomerSegment, MembershipRole } from '@prisma/client';
import { computeVisitFrequency } from '../../retention-v2/visit-frequency';
import { segmentCustomer } from '../../retention-v2/segmentation';
import { computeGoalProgress } from '../../reward-goals/reward-goal-progress';
import { CustomerLoyaltyRepository } from './customer-loyalty.repository';
import { recurrenceKeyFor, type RecurrenceKey } from './recurrence';

/**
 * La lista de Clientes vista como fidelización, no como CRM.
 *
 * Responde las siete preguntas que el dueño realmente se hace: quiénes son,
 * quién vuelve, cuántos sellos tiene cada uno, quién está por completar, quién
 * tiene una recompensa esperando, cuándo vino por última vez.
 *
 * Un solo endpoint devuelve filas + KPIs porque la alternativa es que el
 * browser pida el progreso cliente por cliente: con 200 clientes eso son 200
 * llamadas para pintar una tabla.
 */

export type LoyaltyFilter =
  | 'todos'
  | 'nuevos'
  | 'volvieron'
  | 'cerca'
  | 'recompensa'
  | 'ausentes';

/** Faltando esto o menos, la tarjeta se considera "cerca de completarse". */
const NEAR_COMPLETION_REMAINING = 2;
/** Ventana de los KPIs. Se informa junto al número para que no sea ambiguo. */
const KPI_WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface LoyaltyCustomerRow {
  id: string;
  name: string;
  /** Ya enmascarado si el rol no puede ver el número completo. */
  phone: string;
  createdAt: Date;
  /** Visitas reales al local. Nunca incluye sellos bonus. */
  visitCount: number;
  lastVisitAt: Date | null;
  /** Tarjeta en curso, si tiene una. */
  card: {
    rewardName: string;
    progressVisits: number;
    targetAdditionalVisits: number;
    remainingVisits: number;
  } | null;
  /** Recompensa ganada y sin canjear. Tiene prioridad visual sobre la tarjeta. */
  rewardAvailable: { rewardName: string; unlockedAt: Date | null } | null;
  /**
   * Tiene un beneficio directo (sin tarjeta) ofrecido y sin canjear. Badge
   * discreto aparte de `rewardAvailable` — sellos y beneficios son conceptos
   * separados también acá.
   */
  benefitAvailable: boolean;
  /** Etiqueta de recurrencia, o null cuando no hay evidencia suficiente. */
  recurrence: RecurrenceKey | null;
}

export interface LoyaltyKpis {
  windowDays: number;
  /** Con al menos una visita en la ventana. */
  activos: number;
  /** Con dos o más visitas en total: efectivamente volvieron alguna vez. */
  volvieron: number;
  /** Recompensas desbloqueadas y todavía sin canjear. */
  conRecompensa: number;
  /** Clientes dados de alta dentro de la ventana. */
  nuevos: number;
}

@Injectable()
export class CustomerLoyaltyService {
  constructor(private readonly repository: CustomerLoyaltyRepository) {}

  async list(
    businessId: string,
    options: {
      filter?: LoyaltyFilter;
      search?: string;
      page?: number;
      limit?: number;
      role?: MembershipRole;
    } = {},
    now: Date = new Date(),
  ) {
    const page = Math.max(options.page ?? 1, 1);
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
    const filter = options.filter ?? 'todos';

    const [
      customers,
      visitsByCustomer,
      activeGoals,
      unlockedGoals,
      lastSends,
      availableDirectBenefits,
    ] = await Promise.all([
      this.repository.findCustomers(businessId, options.search),
      this.repository.findVisitDates(businessId, now),
      this.repository.findActiveGoals(businessId),
      this.repository.findUnlockedGoals(businessId),
      this.repository.findLastInterventionAt(businessId),
      this.repository.findAvailableDirectBenefits(businessId),
    ]);

    const benefitAvailableCustomers = new Set(
      availableDirectBenefits.map((b) => b.customerId),
    );

    const bonusByGoal = await this.repository.countBonusStampsByGoal(
      businessId,
      activeGoals.map((g) => g.id),
    );

    const goalByCustomer = new Map(activeGoals.map((g) => [g.customerId, g]));
    const unlockedByCustomer = new Map(
      unlockedGoals.map((g) => [g.customerId, g]),
    );

    const rows: LoyaltyCustomerRow[] = customers.map((customer) => {
      const visitDates = visitsByCustomer.get(customer.id) ?? [];
      const frequency = computeVisitFrequency(visitDates, now);

      const { segment } = segmentCustomer({
        frequency,
        lastInterventionAt: lastSends.get(customer.id) ?? null,
        now,
      });

      const goal = goalByCustomer.get(customer.id);
      const card = goal
        ? (() => {
            // Mismas dos fuentes que el detalle, misma aritmética compartida:
            // visitas posteriores a la activación + sellos bonus.
            const visitProgress = visitDates.filter(
              (d) => d.getTime() > goal.activatedAt.getTime(),
            ).length;
            const progress = computeGoalProgress({
              visitProgress,
              bonusStamps: bonusByGoal.get(goal.id) ?? 0,
              targetAdditionalVisits: goal.targetAdditionalVisits,
            });
            return {
              rewardName: goal.incentiveDefinition.name,
              progressVisits: progress.progressVisits,
              targetAdditionalVisits: progress.targetAdditionalVisits,
              remainingVisits: progress.remainingVisits,
            };
          })()
        : null;

      const unlocked = unlockedByCustomer.get(customer.id);

      return {
        id: customer.id,
        name: customer.name,
        phone: maskPhone(customer.phoneE164, options.role),
        createdAt: customer.createdAt,
        visitCount: frequency.visitCount,
        lastVisitAt: frequency.lastVisitAt,
        card,
        rewardAvailable: unlocked
          ? {
              rewardName: unlocked.incentiveDefinition.name,
              unlockedAt: unlocked.unlockedAt,
            }
          : null,
        benefitAvailable: benefitAvailableCustomers.has(customer.id),
        recurrence: recurrenceKeyFor({ segment, frequency }),
      };
    });

    const filtered = rows.filter((row) => matchesFilter(row, filter));

    // Los que tienen algo pendiente primero; después, por visita más reciente.
    filtered.sort((a, b) => {
      const priority =
        Number(Boolean(b.rewardAvailable)) - Number(Boolean(a.rewardAvailable));
      if (priority !== 0) return priority;
      return (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0);
    });

    const since = new Date(now.getTime() - KPI_WINDOW_DAYS * MS_PER_DAY);
    const kpis: LoyaltyKpis = {
      windowDays: KPI_WINDOW_DAYS,
      // Contados sobre TODOS los clientes del negocio, no sobre la página ni
      // sobre el filtro: un KPI que cambia al filtrar no es un KPI.
      activos: rows.filter(
        (r) => r.lastVisitAt !== null && r.lastVisitAt >= since,
      ).length,
      volvieron: rows.filter((r) => r.visitCount >= 2).length,
      conRecompensa: unlockedGoals.length,
      nuevos: await this.repository.countCreatedSince(businessId, since),
    };

    return {
      data: filtered.slice((page - 1) * limit, page * limit),
      total: filtered.length,
      page,
      limit,
      kpis,
    };
  }

  /**
   * Insights (`getCustomerRetentionStats`) — cuántos clientes hay en cada
   * segmento, a nivel negocio. Reusa exactamente la misma clasificación por
   * cliente que ya usa `list()` (`computeVisitFrequency` + `segmentCustomer`)
   * — nunca una definición paralela de "quién dejó de venir".
   */
  async getSegmentCounts(
    businessId: string,
    now: Date = new Date(),
  ): Promise<Record<CustomerSegment, number>> {
    const [customers, visitsByCustomer, lastSends] = await Promise.all([
      this.repository.findCustomers(businessId),
      this.repository.findVisitDates(businessId, now),
      this.repository.findLastInterventionAt(businessId),
    ]);

    const counts: Record<CustomerSegment, number> = {
      [CustomerSegment.NEW]: 0,
      [CustomerSegment.REPEAT]: 0,
      [CustomerSegment.FREQUENT]: 0,
      [CustomerSegment.AT_RISK]: 0,
      [CustomerSegment.INACTIVE]: 0,
      [CustomerSegment.RECOVERED]: 0,
    };

    for (const customer of customers) {
      const visitDates = visitsByCustomer.get(customer.id) ?? [];
      const frequency = computeVisitFrequency(visitDates, now);
      const { segment } = segmentCustomer({
        frequency,
        lastInterventionAt: lastSends.get(customer.id) ?? null,
        now,
      });
      counts[segment] += 1;
    }

    return counts;
  }
}

function matchesFilter(
  row: LoyaltyCustomerRow,
  filter: LoyaltyFilter,
): boolean {
  switch (filter) {
    case 'todos':
      return true;
    case 'nuevos':
      return row.recurrence === 'nuevo';
    case 'volvieron':
      return row.visitCount >= 2;
    case 'cerca':
      // Cerca significa que todavía le falta algo: una tarjeta completa ya es
      // "recompensa disponible", que es otro filtro.
      return (
        row.card !== null &&
        row.card.remainingVisits > 0 &&
        row.card.remainingVisits <= NEAR_COMPLETION_REMAINING
      );
    case 'recompensa':
      return row.rewardAvailable !== null;
    case 'ausentes':
      return row.recurrence === 'ausente' || row.recurrence === 'demorado';
  }
}

/**
 * OPERATOR ve el número parcialmente oculto: necesita reconocer al cliente en
 * el mostrador, no llevarse la agenda del negocio. OWNER/ADMIN lo ven entero,
 * que es lo que ya podían hacer antes de esta pantalla.
 */
function maskPhone(phoneE164: string, role?: MembershipRole): string {
  if (role === MembershipRole.OWNER || role === MembershipRole.ADMIN) {
    return phoneE164;
  }
  if (phoneE164.length <= 4) return phoneE164;
  return `••••${phoneE164.slice(-4)}`;
}
