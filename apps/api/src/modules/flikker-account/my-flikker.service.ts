import { Injectable, NotFoundException } from '@nestjs/common';
import { RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RewardGoalOrchestratorService } from '../reward-goals/reward-goal-orchestrator.service';
import {
  MissionProgressService,
  type CustomerMissionView,
} from '../missions/mission-progress.service';
import { StreakService } from '../streaks/streak.service';
import { isWorthShowing } from '../streaks/streak-rules';
import { ReturnChallengeService } from '../return-challenges/return-challenge.service';
import { BenefitsService } from '../benefits/benefits.service';

export interface MyFlikkerPlace {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  /** Color de la experiencia pública (Programa → Página de inscripción). */
  checkinBackgroundColor: string | null;
  loyaltyCardColor: string | null;
  loyaltyCardTextColor: string | null;
  loyaltyCardBackgroundImage: string | null;
  loyaltyStampAreaColor: string | null;
  loyaltyStampColor: string | null;
  loyaltyStampIcon: string | null;
  loyaltyShowBusinessName: boolean;
  loyaltyStampBackgroundPattern: string | null;
  loyaltyStampBackgroundOpacity: number | null;
  visitsTotal: number;
  lastVisitAt: string | null;
  rewardGoal: {
    incentiveName: string;
    progressVisits: number;
    visitProgress: number;
    bonusStamps: number;
    targetAdditionalVisits: number;
    remainingVisits: number;
  } | null;
  benefitAvailable: {
    name: string;
    code: string;
    expiresAt: string | null;
  } | null;
  /**
   * Otros beneficios otorgados a este cliente y sin canjear — típicamente
   * por una promoción manual (Notificaciones → Promociones ya puede elegir
   * cualquier Benefit del catálogo, no solo el `active` del check-in).
   * Independiente de `benefitAvailable` (que solo cubre la recompensa de
   * una tarjeta ya desbloqueada) para no duplicar esa fila.
   */
  otherBenefits: {
    title: string;
    description: string | null;
    terms: string | null;
    code: string;
    expiresAt: string | null;
  }[];
  /**
   * Misiones vivas o recién completadas de ESTE negocio. Array vacío cuando el
   * negocio no ofrece ninguna — la pantalla no muestra una tarjeta decorativa
   * con un progreso inventado.
   */
  missions: CustomerMissionView[];
}

/**
 * Una tarjeta de la sección Desafíos.
 *
 * Unión discriminada por `kind`: cada mecánica tiene los campos que
 * realmente necesita, sin forzar a que una misión y una racha compartan una
 * forma artificial. Hoy hay dos variantes; `return_challenge` se suma en
 * Fase 3 sin que la pantalla cambie de estructura.
 */
export type MyFlikkerChallenge =
  | MissionChallenge
  | StreakChallenge
  | ReturnChallengeCard;

interface ChallengeBase {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
}

export interface MissionChallenge extends ChallengeBase, CustomerMissionView {
  kind: 'mission';
}

export interface ReturnChallengeCard extends ChallengeBase {
  kind: 'return_challenge';
  challengeId: string;
  /** Domingo local — el último día para volver. */
  deadlineDayKey: string;
}

export interface StreakChallenge extends ChallengeBase {
  kind: 'streak';
  /** Semanas consecutivas. Nunca 0: una racha rota no llega a la pantalla. */
  currentWeeks: number;
  /** ACTIVE = ya vino esta semana. AT_RISK = todavía puede mantenerla. */
  state: 'ACTIVE' | 'AT_RISK';
  /** Domingo de la semana en curso — el último día para mantenerla. */
  deadlineDayKey: string;
}

/**
 * Prioridad de la lista de Desafíos: primero lo más urgente de atender.
 *
 * Las misiones activas van antes que las rachas porque tienen fecha de corte
 * dura; dentro de cada grupo se ordena por vencimiento. Lo ya completado va
 * al final: es un premio para retirar, no una tarea pendiente.
 *
 * Deja hueco deliberado para `return_challenge` (Fase 3), que entrará arriba
 * de todo sin tocar el resto del orden.
 */
function rank(challenge: MyFlikkerChallenge): number {
  // Lo más urgente de todo: plazo corto y un sello concreto en juego.
  if (challenge.kind === 'return_challenge') return 10;
  if (challenge.kind === 'streak') {
    return challenge.state === 'AT_RISK' ? 30 : 40;
  }
  if (challenge.status === 'COMPLETED') return 50;
  return 20;
}

/** Dentro de un mismo grupo, primero lo que vence antes. */
function compareChallenges(
  a: MyFlikkerChallenge,
  b: MyFlikkerChallenge,
): number {
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;
  if (a.kind === 'mission' && b.kind === 'mission') {
    return Date.parse(a.endsAt) - Date.parse(b.endsAt);
  }
  return 0;
}

/**
 * "Mi Flikker" — the customer's OWN cross-business view (Fase E §18-20). The
 * only surface in the whole product allowed to read `Customer` rows across
 * more than one business for the same request; every field returned is
 * customer-facing (visits, progress, benefit) — segment, assignment,
 * experiment and uplift never leave the business dashboard (Fase E §20).
 */
@Injectable()
export class MyFlikkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rewardGoals: RewardGoalOrchestratorService,
    private readonly missions: MissionProgressService,
    private readonly streaks: StreakService,
    private readonly returnChallenges: ReturnChallengeService,
    private readonly benefits: BenefitsService,
  ) {}

  /**
   * "Desafíos" — todo lo que este cliente tiene activo para volver, de TODOS
   * sus negocios, en una sola lista.
   *
   * Es el read-model convergente: hoy solo trae misiones; cuando existan
   * rachas y desafíos de regreso se suman acá y la pantalla no cambia de
   * forma. Nunca devuelve tarjetas vacías: si no hay nada, la lista es vacía
   * y la pantalla lo dice con sus palabras.
   *
   * Orden: primero lo que está por vencer, después el resto. Lo ya completado
   * va al final — es un premio para retirar, no una tarea pendiente.
   */
  async listChallenges(
    flikkerAccountId: string,
    now: Date = new Date(),
  ): Promise<MyFlikkerChallenge[]> {
    const customers = await this.prisma.customer.findMany({
      where: { flikkerAccountId, isActive: true },
      select: {
        id: true,
        businessId: true,
        business: { select: { name: true, logoUrl: true, timezone: true } },
      },
    });

    // Las rachas de TODOS los lugares salen en una sola query — no una por
    // negocio. Ver `getStreaksForCustomers`.
    const [perBusinessMissions, streaks, challenges] = await Promise.all([
      Promise.all(
        customers.map(async (customer) => {
          const missions = await this.missions.currentView(
            customer.businessId,
            customer.id,
            now,
          );
          return missions.map(
            (mission): MissionChallenge => ({
              kind: 'mission',
              ...mission,
              businessId: customer.businessId,
              businessName: customer.business.name,
              logoUrl: customer.business.logoUrl,
            }),
          );
        }),
      ),
      this.streaks.getStreaksForCustomers(
        customers.map((customer) => ({
          customerId: customer.id,
          businessId: customer.businessId,
          timezone: customer.business.timezone,
        })),
        now,
      ),
      // También en una sola query, por el mismo motivo que las rachas.
      this.returnChallenges.currentViewForCustomers(
        customers.map((customer) => customer.id),
        now,
      ),
    ]);

    // Solo los ACTIVE y sin vencer llegan hasta acá: `currentViewForCustomers`
    // ya filtra por estado y por fecha, así que EXPIRED y CANCELLED nunca se
    // muestran — un desafío cancelado no es algo que explicarle al cliente.
    const challengeCards: ReturnChallengeCard[] = [];
    for (const customer of customers) {
      const challenge = challenges.get(customer.id);
      if (!challenge) continue;
      challengeCards.push({
        kind: 'return_challenge',
        challengeId: challenge.id,
        businessId: customer.businessId,
        businessName: customer.business.name,
        logoUrl: customer.business.logoUrl,
        deadlineDayKey: challenge.deadlineDayKey,
      });
    }

    const streakCards: StreakChallenge[] = [];
    for (const customer of customers) {
      const streak = streaks.get(customer.id);
      // `isWorthShowing` es la única regla: sin dos semanas consecutivas no
      // hay tarjeta. Una racha rota tampoco llega acá, así que la pantalla
      // no puede recibir un "0 semanas".
      if (!streak || !isWorthShowing(streak)) continue;
      streakCards.push({
        kind: 'streak',
        businessId: customer.businessId,
        businessName: customer.business.name,
        logoUrl: customer.business.logoUrl,
        currentWeeks: streak.currentWeeks,
        state: streak.state === 'ACTIVE' ? 'ACTIVE' : 'AT_RISK',
        deadlineDayKey: streak.deadlineDayKey,
      });
    }

    return [
      ...perBusinessMissions.flat(),
      ...streakCards,
      ...challengeCards,
    ].sort(compareChallenges);
  }

  /**
   * Every business where this account has a real, tenant-scoped Customer —
   * a Customer row only ever exists after an actual registration/visit, so
   * no extra "has interacted" filter is needed on top of it (Fase E §19).
   */
  async listPlaces(flikkerAccountId: string): Promise<MyFlikkerPlace[]> {
    const customers = await this.prisma.customer.findMany({
      where: { flikkerAccountId, isActive: true },
      select: {
        id: true,
        businessId: true,
        business: {
          select: {
            name: true,
            logoUrl: true,
            primaryColor: true,
            // Mismo color que el recorrido de check-in: Mi Flikker es su
            // continuación, no una pantalla aparte de Flikker.
            checkinBackgroundColor: true,
            loyaltyCardColor: true,
            loyaltyCardTextColor: true,
            loyaltyCardBackgroundImage: true,
            loyaltyStampAreaColor: true,
            loyaltyStampColor: true,
            loyaltyStampIcon: true,
            welcomeBenefitId: true,
            loyaltyShowBusinessName: true,
            loyaltyStampBackgroundPattern: true,
            loyaltyStampBackgroundOpacity: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return Promise.all(
      customers.map((customer) =>
        this.placeSummary(customer.id, customer.businessId, customer.business),
      ),
    );
  }

  /** The detail view for one business (Fase E §20). */
  async placeDetail(
    flikkerAccountId: string,
    businessId: string,
  ): Promise<MyFlikkerPlace> {
    const customer = await this.prisma.customer.findFirst({
      where: { flikkerAccountId, businessId, isActive: true },
      select: {
        id: true,
        businessId: true,
        business: {
          select: {
            name: true,
            logoUrl: true,
            primaryColor: true,
            // Mismo color que el recorrido de check-in: Mi Flikker es su
            // continuación, no una pantalla aparte de Flikker.
            checkinBackgroundColor: true,
            loyaltyCardColor: true,
            loyaltyCardTextColor: true,
            loyaltyCardBackgroundImage: true,
            loyaltyStampAreaColor: true,
            loyaltyStampColor: true,
            loyaltyStampIcon: true,
            welcomeBenefitId: true,
            loyaltyShowBusinessName: true,
            loyaltyStampBackgroundPattern: true,
            loyaltyStampBackgroundOpacity: true,
          },
        },
      },
    });
    if (!customer) {
      // Same shape as "unknown business" — never confirm or deny whether an
      // account has a relationship with a business it isn't authorized to see.
      throw new NotFoundException('Business not found');
    }
    return this.placeSummary(
      customer.id,
      customer.businessId,
      customer.business,
    );
  }

  private async placeSummary(
    customerId: string,
    businessId: string,
    business: {
      name: string;
      logoUrl: string | null;
      primaryColor: string | null;
      checkinBackgroundColor: string | null;
      loyaltyCardColor: string | null;
      loyaltyCardTextColor: string | null;
      loyaltyCardBackgroundImage: string | null;
      loyaltyStampAreaColor: string | null;
      loyaltyStampColor: string | null;
      loyaltyStampIcon: string | null;
      welcomeBenefitId: string | null;
      loyaltyShowBusinessName: boolean;
      loyaltyStampBackgroundPattern: string | null;
      loyaltyStampBackgroundOpacity: number | null;
    },
  ): Promise<MyFlikkerPlace> {
    const [visitsTotal, lastVisit, rewardView, unclaimedBenefit, missions] =
      await Promise.all([
        this.prisma.visit.count({ where: { businessId, customerId } }),
        this.prisma.visit.findFirst({
          where: { businessId, customerId },
          orderBy: { occurredAt: 'desc' },
          select: { occurredAt: true },
        }),
        this.rewardGoals.currentView(businessId, customerId),
        this.prisma.customerRewardGoal.findFirst({
          where: { businessId, customerId, status: RewardGoalStatus.UNLOCKED },
          select: {
            incentiveDefinition: { select: { name: true } },
            benefitParticipation: {
              select: {
                benefitId: true,
                redemptionCode: true,
                expiresAt: true,
              },
            },
          },
        }),
        // Lectura pura: abrir Mi Flikker nunca completa una misión ni emite
        // un premio — eso solo lo hace una visita real.
        this.missions.currentView(businessId, customerId),
      ]);

    const benefitAvailable = unclaimedBenefit?.benefitParticipation
      ?.redemptionCode
      ? {
          name: unclaimedBenefit.incentiveDefinition.name,
          code: unclaimedBenefit.benefitParticipation.redemptionCode,
          expiresAt:
            unclaimedBenefit.benefitParticipation.expiresAt?.toISOString() ??
            null,
        }
      : null;

    // Cualquier otro beneficio otorgado (típicamente por promoción manual),
    // sin contar el de la recompensa de tarjeta ya cubierta arriba ni el
    // regalo de bienvenida.
    const otherBenefits = await this.benefits.getOtherAvailableBenefits(
      businessId,
      customerId,
      [
        unclaimedBenefit?.benefitParticipation?.benefitId,
        business.welcomeBenefitId,
      ],
    );

    return {
      businessId,
      businessName: business.name,
      logoUrl: business.logoUrl,
      primaryColor: business.primaryColor,
      checkinBackgroundColor: business.checkinBackgroundColor,
      loyaltyCardColor: business.loyaltyCardColor,
      loyaltyCardTextColor: business.loyaltyCardTextColor,
      loyaltyCardBackgroundImage: business.loyaltyCardBackgroundImage,
      loyaltyStampAreaColor: business.loyaltyStampAreaColor,
      loyaltyStampColor: business.loyaltyStampColor,
      loyaltyStampIcon: business.loyaltyStampIcon,
      loyaltyShowBusinessName: business.loyaltyShowBusinessName,
      loyaltyStampBackgroundPattern: business.loyaltyStampBackgroundPattern,
      loyaltyStampBackgroundOpacity: business.loyaltyStampBackgroundOpacity,
      visitsTotal,
      lastVisitAt: lastVisit?.occurredAt.toISOString() ?? null,
      rewardGoal: rewardView.goal,
      benefitAvailable,
      otherBenefits: otherBenefits.map((b) => ({
        title: b.title,
        description: b.description,
        terms: b.terms,
        code: b.code,
        expiresAt: b.expiresAt?.toISOString() ?? null,
      })),
      missions,
    };
  }
}
