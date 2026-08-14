import { Injectable } from '@nestjs/common';
import {
  CustomerEventType,
  Prisma,
  RetentionAssignmentStatus,
  RewardGoalStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Lecturas para la pantalla de Clientes. Todo scopeado a `businessId` sin
 * excepción.
 *
 * Tenancy: `Customer` ya es por negocio (el mismo teléfono en dos negocios son
 * dos filas distintas), pero desde Fase E puede colgar de un `FlikkerAccount`
 * global. Ese vínculo NO se navega nunca desde acá: un negocio ve su relación
 * con el cliente, no la vida del cliente en Flikker. Por eso ninguna query de
 * este archivo filtra por `flikkerAccountId` ni lo incluye en un select.
 */

/** Ventana de historial que se carga para calcular cadencia y estados. */
const HISTORY_WINDOW_DAYS = 400;

const MS_PER_DAY = 86_400_000;

@Injectable()
export class CustomerLoyaltyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Clientes del negocio con los datos de identidad. El resto (visitas,
   * sellos, estado) se resuelve en lote más abajo — nunca con una query por
   * cliente.
   */
  findCustomers(businessId: string, search?: string) {
    const term = search?.trim();
    // El teléfono se guarda en E.164, así que se busca por dígitos sueltos
    // (los últimos cuatro, por ejemplo). Si el término no tiene NINGÚN dígito
    // la cláusula se omite: `contains: ''` matchea todas las filas, y buscar
    // "gómez" terminaría devolviendo el negocio entero.
    const digits = term?.replace(/[^\d+]/g, '') ?? '';

    return this.prisma.customer.findMany({
      where: {
        businessId,
        isActive: true,
        ...(term
          ? {
              OR: [
                {
                  name: { contains: term, mode: Prisma.QueryMode.insensitive },
                },
                ...(digits.length > 0
                  ? [{ phoneE164: { contains: digits } }]
                  : []),
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        phoneE164: true,
        createdAt: true,
        optedOut: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Fechas de visita del negocio en la ventana de historial, en lote.
   *
   * Una sola query para todo el negocio en vez de una por cliente: con la
   * escala del piloto esto es trivial, y `[businessId, occurredAt]` ya está
   * indexado. Si un negocio creciera lo suficiente como para que esto pese,
   * el próximo paso es mover el cálculo de cadencia a SQL — no paginar acá,
   * porque los estados dependen del historial completo del cliente.
   */
  async findVisitDates(businessId: string, now: Date) {
    const since = new Date(now.getTime() - HISTORY_WINDOW_DAYS * MS_PER_DAY);
    const visits = await this.prisma.visit.findMany({
      where: { businessId, occurredAt: { gte: since } },
      select: { customerId: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    });

    const byCustomer = new Map<string, Date[]>();
    for (const visit of visits) {
      const list = byCustomer.get(visit.customerId);
      if (list) list.push(visit.occurredAt);
      else byCustomer.set(visit.customerId, [visit.occurredAt]);
    }
    return byCustomer;
  }

  /** Tarjetas en curso del negocio, con el nombre de la recompensa. */
  findActiveGoals(businessId: string) {
    return this.prisma.customerRewardGoal.findMany({
      where: { businessId, status: RewardGoalStatus.ACTIVE },
      select: {
        id: true,
        customerId: true,
        activatedAt: true,
        targetAdditionalVisits: true,
        incentiveDefinition: { select: { name: true } },
      },
    });
  }

  /**
   * Recompensas desbloqueadas y todavía sin canjear. Es exactamente lo que el
   * dueño quiere ver ("¿quién tiene una recompensa disponible?"): el estado
   * UNLOCKED significa ganada y pendiente de entrega.
   */
  findUnlockedGoals(businessId: string) {
    return this.prisma.customerRewardGoal.findMany({
      where: { businessId, status: RewardGoalStatus.UNLOCKED },
      select: {
        customerId: true,
        unlockedAt: true,
        incentiveDefinition: { select: { name: true } },
      },
    });
  }

  /**
   * Clientes con un beneficio directo (sin tarjeta) ofrecido y todavía sin
   * canjear — para el badge discreto "Beneficio disponible" en la lista.
   * Misma exclusión que en el detalle: `rewardGoal: { is: null }` deja
   * afuera los que ya se cuentan como recompensa de tarjeta (ese caso ya
   * tiene su propio badge, "Recompensa disponible").
   */
  findAvailableDirectBenefits(businessId: string) {
    return this.prisma.benefitParticipation.findMany({
      where: { businessId, rewardGoal: { is: null }, redeemedAt: null },
      select: { customerId: true },
    });
  }

  /** Sellos bonus por meta, en lote. */
  async countBonusStampsByGoal(businessId: string, goalIds: string[]) {
    if (goalIds.length === 0) return new Map<string, number>();
    const rows = await this.prisma.rewardGoalBonusStamp.groupBy({
      by: ['rewardGoalId'],
      where: { businessId, rewardGoalId: { in: goalIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.rewardGoalId, r._count._all]));
  }

  /**
   * Último contacto de Retention V2 por cliente. Solo se usa para distinguir
   * "volvió después de que le escribimos" de una vuelta cualquiera — es el
   * mismo insumo que ya usa la segmentación.
   */
  async findLastInterventionAt(businessId: string) {
    const rows = await this.prisma.retentionAssignment.groupBy({
      by: ['customerId'],
      where: { businessId, sentAt: { not: null } },
      _max: { sentAt: true },
    });
    return new Map(
      rows
        .filter((r) => r._max.sentAt !== null)
        .map((r) => [r.customerId, r._max.sentAt!]),
    );
  }

  /** Clientes nuevos del negocio desde una fecha. */
  countCreatedSince(businessId: string, since: Date) {
    return this.prisma.customer.count({
      where: { businessId, isActive: true, createdAt: { gte: since } },
    });
  }

  // ── Detalle de un cliente ───────────────────────────────────────────────
  //
  // Todas llevan `businessId` en el `where`, incluso cuando el `customerId`
  // ya sería suficiente para encontrar la fila. Es a propósito: si un id de
  // otro negocio se filtrara por la URL, la query no devuelve nada en vez de
  // devolver datos ajenos.

  findCustomer(businessId: string, customerId: string) {
    return this.prisma.customer.findFirst({
      where: { id: customerId, businessId, isActive: true },
      select: {
        id: true,
        name: true,
        phoneE164: true,
        createdAt: true,
        optedOut: true,
      },
    });
  }

  /** Visitas del cliente EN ESTE NEGOCIO, más antigua primero. */
  findCustomerVisits(businessId: string, customerId: string) {
    return this.prisma.visit.findMany({
      where: { businessId, customerId },
      select: { id: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    });
  }

  /** Todas las tarjetas del cliente, incluidas las cerradas. */
  findCustomerGoals(businessId: string, customerId: string) {
    return this.prisma.customerRewardGoal.findMany({
      where: { businessId, customerId },
      select: {
        id: true,
        status: true,
        activatedAt: true,
        targetAdditionalVisits: true,
        unlockedAt: true,
        redeemedAt: true,
        expiresAt: true,
        cancelledAt: true,
        incentiveDefinition: { select: { name: true } },
        benefitParticipation: {
          select: { redeemedAt: true, benefit: { select: { title: true } } },
        },
      },
      orderBy: { activatedAt: 'desc' },
    });
  }

  findCustomerFeedback(businessId: string, customerId: string) {
    return this.prisma.checkinFeedback.findMany({
      where: { businessId, customerId },
      select: {
        id: true,
        score: true,
        comment: true,
        createdAt: true,
        bonusStamp: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Mensajes que Flikker le mandó a este cliente por este negocio. Se trae el
   * objetivo del experimento SOLO para poder decir "recordatorio de progreso"
   * o "mensaje para volver" — nunca se expone hacia afuera.
   */
  findCustomerMessages(businessId: string, customerId: string) {
    return this.prisma.message.findMany({
      where: { businessId, customerId },
      select: {
        id: true,
        status: true,
        sentAt: true,
        createdAt: true,
        retentionAssignment: {
          select: { experiment: { select: { objective: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Escaneos reales — un cliente YA identificado que vuelve a abrir el QR,
   * haya sumado una visita nueva o no (el check-in lo deduplica dentro de la
   * ventana de horas del negocio). Distinto de una visita: acá no hay
   * `Visit` de por medio, solo el hecho de que volvió a escanear.
   *
   * No confundir con `ScanEvent` — ese modelo es del flujo LEGACY de
   * campañas y ni siquiera tiene `customerId` (no hay forma de atribuir un
   * scan anónimo a un cliente identificado, así que no se muestra ninguno:
   * "no inventar" es literal acá).
   */
  findCustomerScans(businessId: string, customerId: string) {
    return this.prisma.customerEvent.findMany({
      where: {
        businessId,
        customerId,
        type: CustomerEventType.customer_session_restored,
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Beneficios que este cliente recibió DIRECTAMENTE — bienvenida,
   * reactivación, o cualquier canje del catálogo — sin pasar por la tarjeta
   * de sellos. `rewardGoal: { is: null }` es justo la exclusión: los
   * vinculados a una tarjeta ya se cuentan en `findCustomerGoals` (Sellos y
   * Beneficios se mantienen separados a propósito — una persona puede tener
   * beneficios sin tarjeta).
   */
  findCustomerDirectBenefits(businessId: string, customerId: string) {
    return this.prisma.benefitParticipation.findMany({
      where: { businessId, customerId, rewardGoal: { is: null } },
      select: {
        id: true,
        createdAt: true,
        redeemedAt: true,
        benefitTitleSnapshot: true,
        benefit: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Retornos confirmados después de una reactivación — solo cuando de verdad
   * se le mandó un mensaje (`status: SENT`; un CONTROL no manda nada, así
   * que "volvió" ahí no sería atribuible a ninguna reactivación real).
   */
  findCustomerReactivationReturns(businessId: string, customerId: string) {
    return this.prisma.retentionOutcome.findMany({
      where: {
        businessId,
        customerId,
        returned: true,
        assignment: { status: RetentionAssignmentStatus.SENT },
      },
      select: { id: true, returnedAt: true },
      orderBy: { returnedAt: 'desc' },
    });
  }
}
