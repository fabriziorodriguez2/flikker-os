import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerLoyaltyService } from '../customers/loyalty/customer-loyalty.service';
import { LoyaltyProgramService } from '../reward-goals/loyalty-program.service';
import { ReactivationFunnelService } from '../retention-v2/reactivation-funnel.service';
import { BenefitsRepository } from '../benefits/benefits.repository';
import { InsightsRepository } from './insights.repository';
import {
  hasEnoughRetentionEvidence,
  type BusinessImpactMetrics,
  type BusinessImpactWindowMetrics,
} from './business-impact';

const MS_PER_DAY = 86_400_000;

/**
 * "Impacto de Flikker" — fuente única de verdad para "qué le está
 * aportando Flikker a este negocio". Insights (la pantalla), los emails de
 * ciclo de vida al dueño y los hitos de WhatsApp piden ACÁ, nunca vuelven a
 * calcular por su cuenta — así los tres siempre coinciden.
 *
 * No define ninguna regla de negocio nueva: cada número sale del servicio
 * que ya es dueño de ese concepto (`CustomerLoyaltyService`,
 * `LoyaltyProgramService`, `ReactivationFunnelService`, `InsightsRepository`,
 * `BenefitsRepository.countRedeemed` — el único método canónico de
 * "Benefit canjeado" ya establecido para Inicio/Insights/Retención).
 *
 * `getWindowMetrics` es el bloque genuinamente reusable: cualquier ventana
 * arbitraria `[from, to)` (primera semana, trial, mes calendario, semana
 * calendario...) pasa por ACÁ — antes cada email de ciclo de vida repetía
 * las mismas 4-5 queries por su cuenta; ahora las piden todas en un solo
 * lugar. `getImpact` es solo `getWindowMetrics` aplicado a las 3 ventanas
 * estándar (`sinceFlikker`/`last30Days`) más el bloque `lifetime`.
 *
 * Evolución de rating desde un baseline: deliberadamente NO existe acá.
 * Auditado — `Business` nunca guarda un snapshot del rating al conectar
 * (`googlePlaceRating` se pisa en cada refresh), así que no hay baseline
 * real de la que hablar. Mostrarla igual sería inventar atribución.
 */
@Injectable()
export class BusinessImpactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: CustomerLoyaltyService,
    private readonly rewardProgram: LoyaltyProgramService,
    private readonly reactivationFunnel: ReactivationFunnelService,
    private readonly benefits: BenefitsRepository,
    private readonly insightsRepository: InsightsRepository,
  ) {}

  async getImpact(
    businessId: string,
    now: Date = new Date(),
  ): Promise<BusinessImpactMetrics> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { onboardingCompletedAt: true, createdAt: true },
    });
    const anchor: 'onboarding' | 'created' = business?.onboardingCompletedAt
      ? 'onboarding'
      : 'created';
    const windowStart =
      business?.onboardingCompletedAt ?? business?.createdAt ?? now;
    const last30Start = new Date(now.getTime() - 30 * MS_PER_DAY);

    const [
      sinceFlikkerWindow,
      last30DaysWindow,
      loyaltyList,
      rewardOverview,
      funnel,
      benefitStats,
      lifetimeRedeemed,
      reviewsSinceFlikker,
    ] = await Promise.all([
      this.getWindowMetrics(businessId, windowStart, now),
      this.getWindowMetrics(businessId, last30Start, now),
      this.loyalty.list(businessId, {}, now),
      this.rewardProgram.getOverview(businessId),
      this.reactivationFunnel.forBusiness(businessId),
      this.insightsRepository.getBenefitIssuanceStats(businessId),
      this.benefits.countRedeemed(businessId),
      this.insightsRepository.countReviewsSinceFlikker(businessId),
    ]);

    const benefitsIssuedLifetime = benefitStats.reduce(
      (sum, row) => sum + row.issued,
      0,
    );

    return {
      sinceFlikker: { ...sinceFlikkerWindow, windowStart, anchor },
      last30Days: last30DaysWindow,
      lifetime: {
        customersIdentified: loyaltyList.total,
        customersReturned: loyaltyList.kpis.volvieron,
        customersReturnedAfterContact: funnel.overall.returned,
        benefitsIssued: benefitsIssuedLifetime,
        benefitsRedeemed: lifetimeRedeemed,
        cardsInProgress: rewardOverview.stats.cardsInProgress,
        reviewsSinceFlikker,
      },
      reactivationEvidenceState: funnel.overall.evidenceState,
      hasEnoughRetentionEvidence: hasEnoughRetentionEvidence(
        funnel.overall.evidenceState,
      ),
    };
  }

  /**
   * El bloque reusable de verdad: clientes identificados/volvieron/volvieron
   * después de contacto, beneficios canjeados y reseñas nuevas, para
   * CUALQUIER ventana `[from, to)` — primera semana, trial, un mes
   * calendario, una semana calendario, lo que sea. Los emails de ciclo de
   * vida al dueño (`OwnerLifecycleEmailsService`) piden acá en vez de
   * repetir las mismas 4-5 queries por su cuenta.
   */
  async getWindowMetrics(
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<BusinessImpactWindowMetrics> {
    const [
      customersIdentified,
      customersReturned,
      customersReturnedAfterContact,
      benefitsRedeemed,
      newReviews,
    ] = await Promise.all([
      this.insightsRepository.countNewCustomersInRange(businessId, from, to),
      this.insightsRepository.countReturningCustomersInRange(
        businessId,
        from,
        to,
      ),
      this.reactivationFunnel.countRecoveredInRange(businessId, from, to),
      // `to` siempre coincide con "ahora" en los call sites reales (nunca un
      // corte en el pasado con datos posteriores que este método pudiera
      // incluir de más) — por eso `countRedeemed({from})`, sin límite
      // superior, sigue siendo exacto acá.
      this.benefits.countRedeemed(businessId, { from }),
      this.insightsRepository.countReviewsInRange(businessId, from, to),
    ]);

    return {
      customersIdentified,
      customersReturned,
      customersReturnedAfterContact,
      benefitsRedeemed,
      newReviews,
    };
  }
}
