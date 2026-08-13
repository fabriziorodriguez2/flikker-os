import { Injectable } from '@nestjs/common';
import { RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';

const RECENT_ACTIVITY_LIMIT = 12;

export interface LoyaltyProgramActivityItem {
  id: string;
  type: 'stamp' | 'unlocked' | 'redeemed' | 'feedback';
  customerName: string | null;
  detail: string | null;
  occurredAt: string;
}

/**
 * "Programa" — la fachada de negocio sobre Reward Goals. Traduce el estado
 * interno (metas, incentivos autorizados, ajustes de retención) a los cuatro
 * números y la actividad que el dueño realmente entiende, sin exponer
 * ninguno de los nombres internos.
 *
 * No decide nada: solo lee. Toda la lógica de creación/desbloqueo sigue
 * viviendo en `RewardGoalEngineService`/`RewardGoalUnlockService`.
 */
@Injectable()
export class LoyaltyProgramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: RetentionSettingsService,
  ) {}

  async getOverview(businessId: string) {
    const settings = await this.settings.getOrCreate(businessId);

    const [
      customersParticipating,
      cardsInProgress,
      unlockedTotal,
      redeemedTotal,
      rewardBenefit,
      welcomeBenefit,
      recentActivity,
    ] = await Promise.all([
      // Clientes distintos que alguna vez tuvieron una tarjeta.
      this.prisma.customerRewardGoal
        .groupBy({ by: ['customerId'], where: { businessId } })
        .then((rows) => rows.length),
      this.prisma.customerRewardGoal.count({
        where: { businessId, status: RewardGoalStatus.ACTIVE },
      }),
      this.prisma.customerRewardGoal.count({
        where: { businessId, unlockedAt: { not: null } },
      }),
      this.prisma.customerRewardGoal.count({
        where: { businessId, redeemedAt: { not: null } },
      }),
      // La recompensa vigente = el beneficio autorizado como tarjeta. Puede
      // haber varios autorizados; el motor elige el menor id, así que se
      // muestra ese mismo criterio para que la UI no mienta.
      this.prisma.retentionIncentiveDefinition.findFirst({
        where: { businessId, active: true, rewardGoalEligible: true },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, benefitId: true },
      }),
      // Regalo de bienvenida: sale de `Business.welcomeBenefitId`, NO de
      // `Benefit.active` — son conceptos distintos (ver
      // `BenefitsService.grantWelcomeGift`).
      this.prisma.business
        .findUnique({
          where: { id: businessId },
          select: { welcomeBenefit: { select: { id: true, title: true } } },
        })
        .then((row) => row?.welcomeBenefit ?? null),
      this.buildRecentActivity(businessId),
    ]);

    const stampsRequired =
      settings.rewardGoalMinVisits ?? settings.rewardGoalMaxVisits ?? null;

    return {
      enabled: settings.rewardGoalsEnabled,
      feedbackBonusEnabled: settings.rewardGoalFeedbackBonusEnabled,
      stampsRequired,
      reward: rewardBenefit
        ? { name: rewardBenefit.name, benefitId: rewardBenefit.benefitId }
        : null,
      welcomeGift: welcomeBenefit
        ? { name: welcomeBenefit.title, benefitId: welcomeBenefit.id }
        : null,
      stats: {
        customersParticipating,
        cardsInProgress,
        unlockedTotal,
        redeemedTotal,
      },
      recentActivity,
    };
  }

  /**
   * Actividad del programa únicamente — nunca el timeline completo del
   * cliente. Cuatro fuentes, mezcladas y ordenadas por fecha real.
   */
  private async buildRecentActivity(
    businessId: string,
  ): Promise<LoyaltyProgramActivityItem[]> {
    const take = RECENT_ACTIVITY_LIMIT;

    const [unlocked, redeemed, stamps, feedback] = await Promise.all([
      this.prisma.customerRewardGoal.findMany({
        where: { businessId, unlockedAt: { not: null } },
        orderBy: { unlockedAt: 'desc' },
        take,
        select: {
          id: true,
          unlockedAt: true,
          customer: { select: { name: true } },
          incentiveDefinition: { select: { name: true } },
        },
      }),
      this.prisma.customerRewardGoal.findMany({
        where: { businessId, redeemedAt: { not: null } },
        orderBy: { redeemedAt: 'desc' },
        take,
        select: {
          id: true,
          redeemedAt: true,
          customer: { select: { name: true } },
          incentiveDefinition: { select: { name: true } },
        },
      }),
      this.prisma.rewardGoalBonusStamp.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
      this.prisma.checkinFeedback.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          createdAt: true,
          score: true,
          customer: { select: { name: true } },
        },
      }),
    ]);

    const items: LoyaltyProgramActivityItem[] = [
      ...unlocked.map((g) => ({
        id: `unlocked-${g.id}`,
        type: 'unlocked' as const,
        customerName: g.customer?.name ?? null,
        detail: g.incentiveDefinition?.name ?? null,
        occurredAt: (g.unlockedAt as Date).toISOString(),
      })),
      ...redeemed.map((g) => ({
        id: `redeemed-${g.id}`,
        type: 'redeemed' as const,
        customerName: g.customer?.name ?? null,
        detail: g.incentiveDefinition?.name ?? null,
        occurredAt: (g.redeemedAt as Date).toISOString(),
      })),
      ...stamps.map((s) => ({
        id: `stamp-${s.id}`,
        type: 'stamp' as const,
        customerName: s.customer?.name ?? null,
        detail: 'Sello extra por feedback',
        occurredAt: s.createdAt.toISOString(),
      })),
      ...feedback.map((f) => ({
        id: `feedback-${f.id}`,
        type: 'feedback' as const,
        customerName: f.customer?.name ?? null,
        detail: `${f.score} de 5`,
        occurredAt: f.createdAt.toISOString(),
      })),
    ];

    return items
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, RECENT_ACTIVITY_LIMIT);
  }
}
