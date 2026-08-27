import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerLoyaltyService } from '../customers/loyalty/customer-loyalty.service';
import { ReviewsOverviewService } from '../reviews/reviews-overview.service';
import { LoyaltyProgramService } from '../reward-goals/loyalty-program.service';
import { RetentionResultsOverviewService } from '../retention-v2/retention-results-overview.service';
import { ReactivationFunnelService } from '../retention-v2/reactivation-funnel.service';
import { BenefitsRepository } from '../benefits/benefits.repository';
import { InsightsRepository } from './insights.repository';
import { BusinessImpactService } from './business-impact.service';
import {
  generateInsights,
  type InsightsMetricsBundle,
} from './insights-narrator';

const DEFAULT_TIMEZONE = 'America/Montevideo';
const VISIT_TIMING_WINDOW_DAYS = 90;
/** Misma ventana que el KPI "Beneficios canjeados" de Inicio. */
const REDEEMED_WINDOW_DAYS = 30;

/**
 * Insights — los 6 read-models pedidos, todos componiendo servicios que ya
 * existen (nunca recalculando lo que otro módulo ya calcula) más las
 * agregaciones genuinamente nuevas de `InsightsRepository`. Es también la
 * única fuente del "bundle" estructurado que consumen el resumen IA y el
 * chatbot — nunca acceso libre a la base para ninguno de los dos.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: InsightsRepository,
    private readonly loyalty: CustomerLoyaltyService,
    private readonly reviews: ReviewsOverviewService,
    private readonly rewardProgram: LoyaltyProgramService,
    private readonly retentionResults: RetentionResultsOverviewService,
    private readonly reactivationFunnel: ReactivationFunnelService,
    private readonly benefits: BenefitsRepository,
    private readonly businessImpact: BusinessImpactService,
  ) {}

  /**
   * Pantalla Insights completa: el bundle + las afirmaciones ya narradas +
   * "Impacto de Flikker" (`BusinessImpactService` — fuente única, la misma
   * que consumen los emails de ciclo de vida y los hitos de WhatsApp).
   */
  async getBusinessOverview(businessId: string, now: Date = new Date()) {
    const [metrics, impact] = await Promise.all([
      this.getMetricsBundle(businessId, now),
      this.businessImpact.getImpact(businessId, now),
    ]);
    return { metrics, insights: generateInsights(metrics), impact };
  }

  async getCustomerRetentionStats(businessId: string, now: Date = new Date()) {
    const [segmentCounts, list] = await Promise.all([
      this.loyalty.getSegmentCounts(businessId, now),
      this.loyalty.list(businessId, {}, now),
    ]);
    return {
      totalCustomers: list.total,
      newCustomers: list.kpis.nuevos,
      returningCustomers: list.kpis.volvieron,
      windowDays: list.kpis.windowDays,
      segmentCounts,
    };
  }

  async getReviewStats(businessId: string, now: Date = new Date()) {
    const overview = await this.reviews.forBusiness(businessId, 30, now);
    // Nunca se reenvía `reviews`/`feedback`/`toReview` — esos arrays traen
    // nombre de cliente y texto libre. Solo agregados.
    // Mismos nombres inequívocos que el bundle: el chatbot contesta preguntas
    // como "¿cuántas reseñas tengo?" y con un `total` ambiguo respondía con
    // las importadas.
    return {
      googleReviewsTotal: overview.summary.googleReviewsTotal,
      googleReviewsImported: overview.summary.googleReviewsImported,
      sinceFlikker: overview.summary.sinceFlikker,
      inPeriod: overview.summary.inPeriod,
      feedbackInPeriod: overview.summary.feedbackInPeriod,
      googleRating: overview.summary.googleRating,
      importedRating: overview.summary.importedRating,
      ratingDistribution: overview.summary.ratingDistribution,
    };
  }

  getPromotionStats(businessId: string) {
    return this.repository.getPromotionStats(businessId);
  }

  async getRewardStats(businessId: string) {
    const overview = await this.rewardProgram.getOverview(businessId);
    return overview.stats;
  }

  async getNotificationStats(businessId: string) {
    const [reactivation, promotions] = await Promise.all([
      this.retentionResults.forBusiness(businessId),
      this.repository.getPromotionStats(businessId),
    ]);
    return { reactivation, promotions };
  }

  /**
   * El bundle estructurado completo — misma forma para la pantalla, el
   * resumen IA y el chatbot. Nunca incluye teléfono/email/nombre de
   * cliente: solo conteos y agregados.
   */
  async getMetricsBundle(
    businessId: string,
    now: Date = new Date(),
  ): Promise<InsightsMetricsBundle> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const timezone = business?.timezone ?? DEFAULT_TIMEZONE;

    const [
      list,
      segmentCounts,
      visitTrend,
      visitTiming,
      rewardOverview,
      stampCardImpact,
      benefitStats,
      promotionStats,
      reactivationFunnel,
      reviewsOverview,
      benefitsRedeemedInWindow,
    ] = await Promise.all([
      this.loyalty.list(businessId, {}, now),
      this.loyalty.getSegmentCounts(businessId, now),
      this.repository.getVisitTrend(businessId, now),
      this.repository.getVisitTimingDistribution(
        businessId,
        timezone,
        VISIT_TIMING_WINDOW_DAYS,
        now,
      ),
      this.rewardProgram.getOverview(businessId),
      this.repository.getStampCardImpactStats(businessId),
      this.repository.getBenefitIssuanceStats(businessId),
      this.repository.getPromotionStats(businessId),
      // El mismo KPI real que Notificaciones — nunca se recalcula acá.
      this.reactivationFunnel.forBusiness(businessId),
      this.reviews.forBusiness(businessId, 30, now),
      // El MISMO método que usa Inicio para su KPI "Beneficios canjeados",
      // con la MISMA ventana — no una query paralela que pueda divergir.
      this.benefits.countRedeemed(businessId, {
        from: new Date(now.getTime() - REDEEMED_WINDOW_DAYS * 86_400_000),
      }),
    ]);

    return {
      totalCustomers: list.total,
      newCustomersInWindow: list.kpis.nuevos,
      windowDays: list.kpis.windowDays,
      returningCustomers: list.kpis.volvieron,
      segmentCounts,
      visitTrend,
      visitTiming,
      stampCard: rewardOverview.stats,
      stampCardImpact,
      benefitStats,
      promotionStats,
      reactivationFunnel,
      benefitsRedeemedInWindow,
      reviewStats: {
        // Las tres cantidades son distintas y ninguna sustituye a la otra:
        // el total real de Google (194), lo que alcanzamos a importar (60) y
        // lo publicado desde que existe la cuenta (3). Antes solo viajaba la
        // segunda, con el nombre `total`, y el resumen terminaba diciendo
        // "el comercio cuenta con 60 reseñas".
        googleReviewsTotal: reviewsOverview.summary.googleReviewsTotal,
        googleReviewsImported: reviewsOverview.summary.googleReviewsImported,
        sinceFlikker: reviewsOverview.summary.sinceFlikker,
        googleRating: reviewsOverview.summary.googleRating,
        importedRating: reviewsOverview.summary.importedRating,
        historySyncStatus: reviewsOverview.google.historySync.status,
        inPeriod: reviewsOverview.summary.inPeriod,
        feedbackInPeriod: reviewsOverview.summary.feedbackInPeriod,
      },
    };
  }
}
