import { Injectable, Logger } from '@nestjs/common';
import { ExperienceVersion, MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from '../modules/plans/plans.service';
import { ReactivationFunnelService } from '../modules/retention-v2/reactivation-funnel.service';
import { InsightsRepository } from '../modules/insights/insights.repository';
import { OwnerLifecycleAiSummaryService } from '../modules/insights/owner-lifecycle-ai-summary.service';
import {
  OwnerLifecycleEmailLogService,
  type OwnerLifecycleEmailKind,
} from './owner-lifecycle-email-log.service';
import {
  calendarDayDiff,
  isLocalDayOfMonthAtHour,
  isLocalWeekdayAtHour,
  localMondayIso,
  previousLocalMonthKey,
  previousLocalMonthRange,
  previousLocalWeekRange,
} from './owner-lifecycle-time';
import {
  renderFirstMonthEmail,
  renderFirstWeekEmail,
  renderMilestoneEmail,
  renderMonthlySummaryEmail,
  renderTrialEndingEmail,
  renderWeeklySummaryEmail,
} from './owner-lifecycle-email-templates';

/**
 * Prioridad de envío: como máximo UN email de este sistema por negocio por
 * tick horario — el primero due (fecha cumplida Y sin log previo) en este
 * orden gana; el resto se descarta para este tick, no se reprograma (ver
 * el plan — "no mandar dos casi-iguales el mismo día"). `first_week` va
 * primero aunque el usuario no lo puso en su lista de prioridad
 * (trial_ending > first_month > monthly > weekly > milestone): en la
 * práctica nunca choca (día 7 vs. día ~25-28 de un trial de 30 días).
 */
const OWNER_LIFECYCLE_PRIORITY: OwnerLifecycleEmailKind[] = [
  'first_week',
  'trial_ending_5d',
  'trial_ending_2d',
  'first_month',
  'monthly_summary',
  'weekly_summary_v2',
  'milestone',
];

const LOW_ACTIVITY_THRESHOLD = 3;

interface BusinessRow {
  id: string;
  name: string;
  timezone: string;
  onboardingCompletedAt: Date | null;
  benefitsTrialStartedAt: Date | null;
  benefitsTrialEndsAt: Date | null;
}

interface Candidate {
  kind: OwnerLifecycleEmailKind;
  dedupeKey: string;
}

interface MilestoneDefinition {
  key: string;
  metric: (businessId: string) => Promise<number>;
  threshold: number;
}

/**
 * Orquestador de los 6 emails de ciclo de vida al dueño/manager de negocios
 * CHECKIN_V2 (primera semana, semanal, mensual, primer mes, trial por
 * terminar, hitos). Nunca recalcula reglas de negocio: cada número sale de
 * un servicio que ya existe (`ReactivationFunnelService`,
 * `InsightsRepository`, `ReviewsOverviewService`, `PlansService`). La
 * idempotencia real la da `OwnerLifecycleEmailLogService.sendOnce` (índice
 * único), esto solo decide QUÉ candidato intentar primero.
 */
@Injectable()
export class OwnerLifecycleEmailsService {
  private readonly logger = new Logger(OwnerLifecycleEmailsService.name);

  private readonly milestones: MilestoneDefinition[] = [
    {
      key: 'customers_50',
      threshold: 50,
      metric: (businessId) =>
        this.prisma.customer.count({ where: { businessId } }),
    },
    {
      key: 'customers_100',
      threshold: 100,
      metric: (businessId) =>
        this.prisma.customer.count({ where: { businessId } }),
    },
    {
      key: 'reviews_10',
      threshold: 10,
      metric: (businessId) =>
        this.insightsRepository.countReviewsSinceFlikker(businessId),
    },
    {
      key: 'reviews_25',
      threshold: 25,
      metric: (businessId) =>
        this.insightsRepository.countReviewsSinceFlikker(businessId),
    },
    {
      key: 'recovered_10',
      threshold: 10,
      metric: async (businessId) =>
        (await this.reactivationFunnel.forBusiness(businessId)).overall
          .returned,
    },
    {
      key: 'recovered_20',
      threshold: 20,
      metric: async (businessId) =>
        (await this.reactivationFunnel.forBusiness(businessId)).overall
          .returned,
    },
    {
      key: 'benefits_redeemed_25',
      threshold: 25,
      metric: (businessId) =>
        this.prisma.benefitParticipation.count({
          where: { businessId, redeemedAt: { not: null } },
        }),
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly reactivationFunnel: ReactivationFunnelService,
    private readonly insightsRepository: InsightsRepository,
    private readonly aiSummary: OwnerLifecycleAiSummaryService,
    private readonly logService: OwnerLifecycleEmailLogService,
  ) {}

  async runHourlySweep(now: Date = new Date()) {
    const businesses = await this.prisma.business.findMany({
      where: {
        isActive: true,
        experienceVersion: ExperienceVersion.CHECKIN_V2,
      },
      select: {
        id: true,
        name: true,
        timezone: true,
        onboardingCompletedAt: true,
        benefitsTrialStartedAt: true,
        benefitsTrialEndsAt: true,
      },
    });

    let sent = 0;
    let suppressed = 0;
    for (const business of businesses) {
      const outcome = await this.processBusiness(business, now);
      if (outcome === 'sent') sent += 1;
      else if (outcome !== 'none') suppressed += 1;
    }

    this.logger.log(
      `Owner lifecycle emails businesses=${businesses.length} sent=${sent} suppressed=${suppressed}`,
    );
    return { businesses: businesses.length, sent, suppressed };
  }

  private async processBusiness(
    business: BusinessRow,
    now: Date,
  ): Promise<'sent' | 'skipped' | 'none'> {
    const candidates = await this.buildCandidates(business, now);
    const byKind = new Map(candidates.map((c) => [c.kind, c]));

    for (const kind of OWNER_LIFECYCLE_PRIORITY) {
      if (kind === 'milestone') {
        const milestoneKey = await this.findDueMilestone(business.id);
        if (!milestoneKey) continue;
        return this.sendMilestoneEmail(business, milestoneKey);
      }

      const candidate = byKind.get(kind);
      if (!candidate) continue;

      const already = await this.logService.alreadyLogged(
        business.id,
        kind,
        candidate.dedupeKey,
      );
      if (already) continue;

      return this.sendForCandidate(business, candidate, now);
    }
    return 'none';
  }

  private async buildCandidates(
    business: BusinessRow,
    now: Date,
  ): Promise<Candidate[]> {
    const tz = business.timezone;
    const candidates: Candidate[] = [];

    if (business.onboardingCompletedAt) {
      const daysSinceOnboarding = calendarDayDiff(
        business.onboardingCompletedAt,
        now,
        tz,
      );
      if (daysSinceOnboarding === 7) {
        candidates.push({ kind: 'first_week', dedupeKey: 'once' });
      }
      if (daysSinceOnboarding === 30) {
        candidates.push({ kind: 'first_month', dedupeKey: 'once' });
      }
    }

    if (business.benefitsTrialStartedAt && business.benefitsTrialEndsAt) {
      // Nunca candidato si el negocio ya es Pro de verdad — chequeado antes
      // de ocupar el slot de prioridad, no después de "ganarlo".
      const alreadyPro = await this.plans.isOnProPlan(business.id);
      if (!alreadyPro) {
        const daysUntilTrialEnd = calendarDayDiff(
          now,
          business.benefitsTrialEndsAt,
          tz,
        );
        if (daysUntilTrialEnd === 5) {
          candidates.push({ kind: 'trial_ending_5d', dedupeKey: 'once' });
        }
        if (daysUntilTrialEnd === 2) {
          candidates.push({ kind: 'trial_ending_2d', dedupeKey: 'once' });
        }
      }
    }

    if (isLocalDayOfMonthAtHour(now, tz, 1, 9)) {
      candidates.push({
        kind: 'monthly_summary',
        dedupeKey: previousLocalMonthKey(now, tz),
      });
    }

    if (isLocalWeekdayAtHour(now, tz, 'Mon', 9)) {
      candidates.push({
        kind: 'weekly_summary_v2',
        dedupeKey: localMondayIso(now, tz),
      });
    }

    return candidates;
  }

  private async sendForCandidate(
    business: BusinessRow,
    candidate: Candidate,
    now: Date,
  ): Promise<'sent' | 'skipped'> {
    const contacts = await this.findOwnerEmails(business.id);

    let content: { subject: string; html: string };
    switch (candidate.kind) {
      case 'first_week':
        content = await this.buildFirstWeekEmail(business);
        break;
      case 'first_month':
        content = await this.buildFirstMonthEmail(business, now);
        break;
      case 'trial_ending_5d':
        content = await this.buildTrialEndingEmail(business, now, 5);
        break;
      case 'trial_ending_2d':
        content = await this.buildTrialEndingEmail(business, now, 2);
        break;
      case 'monthly_summary':
        content = await this.buildMonthlySummaryEmail(business, now);
        break;
      case 'weekly_summary_v2':
        content = await this.buildWeeklySummaryEmail(business, now);
        break;
      default:
        return 'skipped';
    }

    const outcome = await this.logService.sendOnce({
      businessId: business.id,
      kind: candidate.kind,
      dedupeKey: candidate.dedupeKey,
      to: contacts,
      subject: content.subject,
      html: content.html,
    });
    return outcome === 'sent' ? 'sent' : 'skipped';
  }

  private async buildFirstWeekEmail(business: BusinessRow) {
    const start = business.onboardingCompletedAt as Date;
    const end = new Date(start.getTime() + 7 * 86_400_000);
    const [
      newCustomers,
      visits,
      returningCustomers,
      newReviews,
      benefitsRedeemed,
    ] = await Promise.all([
      this.insightsRepository.countNewCustomersInRange(business.id, start, end),
      this.prisma.visit.count({
        where: { businessId: business.id, occurredAt: { gte: start, lt: end } },
      }),
      this.insightsRepository.countReturningCustomersInRange(
        business.id,
        start,
        end,
      ),
      this.insightsRepository.countReviewsInRange(business.id, start, end),
      this.insightsRepository.countBenefitsRedeemedInRange(
        business.id,
        start,
        end,
      ),
    ]);

    return renderFirstWeekEmail({
      businessName: business.name,
      newCustomers,
      visits,
      returningCustomers,
      newReviews,
      benefitsRedeemed,
      lowActivity: newCustomers + visits + newReviews < LOW_ACTIVITY_THRESHOLD,
    });
  }

  private async buildFirstMonthEmail(business: BusinessRow, now: Date) {
    const start = business.onboardingCompletedAt as Date;
    const [
      registeredCustomers,
      returningCustomers,
      recoveredCustomers,
      benefitsRedeemed,
      reviewsSinceFlikker,
    ] = await Promise.all([
      this.insightsRepository.countNewCustomersInRange(business.id, start, now),
      this.insightsRepository.countReturningCustomersInRange(
        business.id,
        start,
        now,
      ),
      this.reactivationFunnel.countRecoveredInRange(business.id, start, now),
      this.insightsRepository.countBenefitsRedeemedInRange(
        business.id,
        start,
        now,
      ),
      this.insightsRepository.countReviewsInRange(business.id, start, now),
    ]);

    return renderFirstMonthEmail({
      businessName: business.name,
      registeredCustomers,
      returningCustomers,
      recoveredCustomers,
      benefitsRedeemed,
      reviewsSinceFlikker,
    });
  }

  private async buildTrialEndingEmail(
    business: BusinessRow,
    now: Date,
    daysRemaining: 5 | 2,
  ) {
    const start = business.benefitsTrialStartedAt as Date;
    const [
      registeredCustomers,
      returningCustomers,
      recoveredCustomers,
      benefitsRedeemed,
    ] = await Promise.all([
      this.insightsRepository.countNewCustomersInRange(business.id, start, now),
      this.insightsRepository.countReturningCustomersInRange(
        business.id,
        start,
        now,
      ),
      this.reactivationFunnel.countRecoveredInRange(business.id, start, now),
      this.insightsRepository.countBenefitsRedeemedInRange(
        business.id,
        start,
        now,
      ),
    ]);

    return renderTrialEndingEmail({
      businessName: business.name,
      daysRemaining,
      registeredCustomers,
      returningCustomers,
      recoveredCustomers,
      benefitsRedeemed,
    });
  }

  private async buildMonthlySummaryEmail(business: BusinessRow, now: Date) {
    const tz = business.timezone;
    const range = previousLocalMonthRange(now, tz);
    const priorRange = previousLocalMonthRange(range.start, tz);

    const [
      returningCustomers,
      recoveredCustomers,
      newCustomers,
      newReviews,
      benefitsRedeemed,
      priorNewCustomers,
      priorReturningCustomers,
      funnel,
    ] = await Promise.all([
      this.insightsRepository.countReturningCustomersInRange(
        business.id,
        range.start,
        range.end,
      ),
      this.reactivationFunnel.countRecoveredInRange(
        business.id,
        range.start,
        range.end,
      ),
      this.insightsRepository.countNewCustomersInRange(
        business.id,
        range.start,
        range.end,
      ),
      this.insightsRepository.countReviewsInRange(
        business.id,
        range.start,
        range.end,
      ),
      this.insightsRepository.countBenefitsRedeemedInRange(
        business.id,
        range.start,
        range.end,
      ),
      this.insightsRepository.countNewCustomersInRange(
        business.id,
        priorRange.start,
        priorRange.end,
      ),
      this.insightsRepository.countReturningCustomersInRange(
        business.id,
        priorRange.start,
        priorRange.end,
      ),
      this.reactivationFunnel.forBusiness(business.id),
    ]);

    const monthLabel = new Intl.DateTimeFormat('es-UY', {
      month: 'long',
      year: 'numeric',
      timeZone: tz,
    }).format(range.start);

    const hasEnoughPriorData = priorNewCustomers + priorReturningCustomers > 0;

    const aiText = await this.aiSummary.generate(business.id, {
      periodLabel: monthLabel,
      newCustomers,
      returningCustomers,
      newReviews,
      reactivation:
        funnel.overall.contacted > 0
          ? {
              contacted: funnel.overall.contacted,
              returned: funnel.overall.returned,
              recoveryRatePercent:
                Math.round(funnel.overall.recoveryRate * 1000) / 10,
            }
          : null,
      benefitsRedeemed,
    });

    return renderMonthlySummaryEmail({
      businessName: business.name,
      monthLabel,
      returningCustomers,
      recoveredCustomers,
      newCustomers,
      newReviews,
      benefitsRedeemed,
      comparison: hasEnoughPriorData
        ? {
            newCustomers: priorNewCustomers,
            returningCustomers: priorReturningCustomers,
          }
        : null,
      aiText,
    });
  }

  private async buildWeeklySummaryEmail(business: BusinessRow, now: Date) {
    const range = previousLocalWeekRange(now, business.timezone);

    const [visits, newCustomers, newReviews, benefitsRedeemed, funnel] =
      await Promise.all([
        this.prisma.visit.count({
          where: {
            businessId: business.id,
            occurredAt: { gte: range.start, lt: range.end },
          },
        }),
        this.insightsRepository.countNewCustomersInRange(
          business.id,
          range.start,
          range.end,
        ),
        this.insightsRepository.countReviewsInRange(
          business.id,
          range.start,
          range.end,
        ),
        this.insightsRepository.countBenefitsRedeemedInRange(
          business.id,
          range.start,
          range.end,
        ),
        this.reactivationFunnel.forBusiness(business.id),
      ]);

    const kpis = [
      { label: 'Visitas', value: visits },
      { label: 'Clientes nuevos', value: newCustomers },
      { label: 'Reseñas nuevas', value: newReviews },
      ...(benefitsRedeemed > 0
        ? [{ label: 'Beneficios canjeados', value: benefitsRedeemed }]
        : []),
    ].slice(0, 4);

    const funnelPayload =
      funnel.overall.contacted > 0
        ? {
            contacted: funnel.overall.contacted,
            returned: funnel.overall.returned,
            recoveryRatePercent:
              Math.round(funnel.overall.recoveryRate * 1000) / 10,
          }
        : null;

    const aiText = await this.aiSummary.generate(business.id, {
      periodLabel: 'esta semana',
      newCustomers,
      returningCustomers: 0,
      newReviews,
      reactivation: funnelPayload,
      benefitsRedeemed,
    });

    return renderWeeklySummaryEmail({
      businessName: business.name,
      funnel: funnelPayload,
      kpis,
      aiText,
    });
  }

  private async findDueMilestone(businessId: string): Promise<string | null> {
    for (const milestone of this.milestones) {
      const already = await this.logService.alreadyLogged(
        businessId,
        'milestone',
        milestone.key,
      );
      if (already) continue;

      const value = await milestone.metric(businessId);
      if (value >= milestone.threshold) return milestone.key;
    }
    return null;
  }

  private async sendMilestoneEmail(
    business: BusinessRow,
    milestoneKey: string,
  ): Promise<'sent' | 'skipped'> {
    const contacts = await this.findOwnerEmails(business.id);
    const { subject, html } = renderMilestoneEmail({
      businessName: business.name,
      milestoneKey,
    });
    const outcome = await this.logService.sendOnce({
      businessId: business.id,
      kind: 'milestone',
      dedupeKey: milestoneKey,
      to: contacts,
      subject,
      html,
    });
    return outcome === 'sent' ? 'sent' : 'skipped';
  }

  /**
   * Mismo criterio que `findOwnerContacts` en `owner-notifications.worker.ts`
   * — duplicado a propósito, no extraído (ver el plan: evitar un segundo
   * touch a ese archivo LEGACY-adjacent).
   */
  private async findOwnerEmails(businessId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        businessId,
        status: 'ACTIVE',
        role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
        user: { isActive: true },
      },
      select: {
        user: { select: { email: true, notificationEmail: true } },
      },
    });
    const emails = memberships
      .map((m) => m.user.notificationEmail ?? m.user.email)
      .filter((email): email is string => Boolean(email));
    return [...new Set(emails)];
  }
}
