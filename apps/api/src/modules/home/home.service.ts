import { Injectable } from '@nestjs/common';
import { CustomerEventType, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerLoyaltyService } from '../customers/loyalty/customer-loyalty.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReviewsOverviewService } from '../reviews/reviews-overview.service';

/**
 * Inicio — la portada del producto.
 *
 * La regla que gobierna este archivo: **no define ninguna métrica propia**.
 * Cada número sale del servicio que ya es dueño de ese concepto:
 *
 *   Clientes activos / volvieron  → CustomerLoyaltyService (mismos KPIs que Clientes)
 *   Automatizaciones              → NotificationsService (mismos flags reales)
 *   Rating / reseñas nuevas       → ReviewsOverviewService (mismo período)
 *
 * Es deliberado y es la parte importante: si Inicio calculara "clientes
 * activos" por su cuenta, tarde o temprano mostraría un número distinto del
 * que muestra Clientes para el mismo negocio, y el dueño dejaría de confiar
 * en los dos. Lo único que se calcula acá es lo que no existe en ningún otro
 * lado: el estado del programa y la actividad reciente.
 */

const MS_PER_DAY = 86_400_000;

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: CustomerLoyaltyService,
    private readonly notifications: NotificationsService,
    private readonly reviews: ReviewsOverviewService,
  ) {}

  async overview(businessId: string, now: Date = new Date()) {
    const [loyalty, automations, reviews, program, activity, redeemed] =
      await Promise.all([
        this.loyalty.list(businessId, { limit: 1 }, now),
        this.notifications.overview(businessId).catch(() => null),
        this.reviews.forBusiness(businessId, 30, now),
        this.programState(businessId),
        this.recentActivity(businessId),
        this.prisma.customerRewardGoal.count({
          where: {
            businessId,
            status: RewardGoalStatus.REDEEMED,
            updatedAt: { gte: new Date(now.getTime() - 30 * MS_PER_DAY) },
          },
        }),
      ]);

    return {
      periodDays: loyalty.kpis.windowDays,

      // Los tres primeros vienen tal cual de sus dueños. El cuarto es un
      // conteo directo de tarjetas canjeadas en la misma ventana.
      kpis: {
        activeCustomers: loyalty.kpis.activos,
        returningCustomers: loyalty.kpis.volvieron,
        rewardsRedeemed: redeemed,
        newReviews: reviews.summary.inPeriod,
      },

      program,

      automations: automations
        ? {
            items: automations.automations,
            activeCount: automations.status.activeCount,
            testMode: automations.status.testMode,
          }
        : null,

      reviews: {
        connected: reviews.google.connected,
        rating: reviews.summary.rating,
        newInPeriod: reviews.summary.inPeriod,
        toReviewCount: reviews.toReview.length,
      },

      activity,
    };
  }

  /** Estado del programa de sellos: qué pide y cómo va. */
  private async programState(businessId: string) {
    const [settings, reward, participating, available] = await Promise.all([
      this.prisma.retentionSettings.findUnique({
        where: { businessId },
        select: { rewardGoalsEnabled: true, rewardGoalMinVisits: true },
      }),
      this.prisma.retentionIncentiveDefinition.findFirst({
        where: { businessId, rewardGoalEligible: true, active: true },
        select: { name: true },
      }),
      this.prisma.customerRewardGoal.count({
        where: { businessId, status: RewardGoalStatus.ACTIVE },
      }),
      this.prisma.customerRewardGoal.count({
        where: { businessId, status: RewardGoalStatus.UNLOCKED },
      }),
    ]);

    if (!settings?.rewardGoalsEnabled || !reward) return null;

    return {
      stampsRequired: settings.rewardGoalMinVisits,
      rewardName: reward.name,
      participating,
      available,
    };
  }

  /**
   * Actividad reciente, de eventos que REALMENTE ocurrieron.
   *
   * Se juntan cuatro fuentes y se toman las más recientes. No hay ninguna
   * entrada sintética: cada una corresponde a una fila. Los nombres técnicos
   * se traducen en el frontend a partir de la clave, igual que en el detalle
   * de un cliente.
   */
  private async recentActivity(businessId: string, limit = 8) {
    const [visits, feedback, unlocked, redeemed] = await Promise.all([
      this.prisma.visit.findMany({
        where: { businessId },
        orderBy: { occurredAt: 'desc' },
        take: limit,
        select: {
          id: true,
          occurredAt: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.checkinFeedback.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.customerRewardGoal.findMany({
        where: { businessId, unlockedAt: { not: null } },
        orderBy: { unlockedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          unlockedAt: true,
          customer: { select: { id: true, name: true } },
          incentiveDefinition: { select: { name: true } },
        },
      }),
      this.prisma.customerRewardGoal.findMany({
        where: { businessId, redeemedAt: { not: null } },
        orderBy: { redeemedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          redeemedAt: true,
          customer: { select: { id: true, name: true } },
          incentiveDefinition: { select: { name: true } },
        },
      }),
    ]);

    const events = [
      ...visits.map((v) => ({
        id: `visit-${v.id}`,
        at: v.occurredAt,
        kind: 'sello' as const,
        customer: v.customer,
        rewardName: null as string | null,
      })),
      ...feedback.map((f) => ({
        id: `feedback-${f.id}`,
        at: f.createdAt,
        kind: 'feedback' as const,
        customer: f.customer,
        rewardName: null as string | null,
      })),
      ...unlocked.map((g) => ({
        id: `unlock-${g.id}`,
        at: g.unlockedAt!,
        kind: 'desbloqueo' as const,
        customer: g.customer,
        rewardName: g.incentiveDefinition.name,
      })),
      ...redeemed.map((g) => ({
        id: `redeem-${g.id}`,
        at: g.redeemedAt!,
        kind: 'canje' as const,
        customer: g.customer,
        rewardName: g.incentiveDefinition.name,
      })),
    ];

    return events
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
  }

  /**
   * Checklist de puesta en marcha.
   *
   * Solo devuelve lo que FALTA. Cuando no queda nada pendiente devuelve una
   * lista vacía y la sección desaparece de la pantalla — no queremos un
   * bloque "Primeros pasos" eterno recordándole al dueño cosas opcionales
   * como si fueran errores. Por eso el soporte físico QR+NFC no está acá.
   */
  async setupTasks(businessId: string) {
    const [settings, reward, source, business, events] = await Promise.all([
      this.prisma.retentionSettings.findUnique({
        where: { businessId },
        select: {
          rewardGoalsEnabled: true,
          progressReminderEnabled: true,
          automaticCampaignsEnabled: true,
        },
      }),
      this.prisma.retentionIncentiveDefinition.findFirst({
        where: { businessId, rewardGoalEligible: true, active: true },
        select: { id: true },
      }),
      this.prisma.visitSource.findFirst({
        where: { businessId, isDefault: true },
        select: { id: true },
      }),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { googleBusinessProfileUrl: true },
      }),
      this.prisma.customerEvent.count({
        where: { businessId, type: CustomerEventType.customer_registered },
      }),
    ]);

    const pending: string[] = [];
    if (!settings?.rewardGoalsEnabled || !reward) pending.push('programa');
    if (!source) pending.push('qr');
    if (!business?.googleBusinessProfileUrl) pending.push('google');
    if (
      !settings?.progressReminderEnabled &&
      !settings?.automaticCampaignsEnabled
    ) {
      pending.push('automatizaciones');
    }
    // Nada que hacer hasta que exista el programa: pedir el primer cliente
    // antes de eso sería pedirle algo que todavía no puede pasar.
    if (pending.length === 0 && events === 0) pending.push('primer-cliente');

    return pending;
  }
}
