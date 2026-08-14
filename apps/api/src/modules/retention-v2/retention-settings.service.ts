import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  RetentionExperimentStatus,
  RetentionSettings,
  RetentionStrategyType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateRetentionSettingsDto } from './dto/update-retention-settings.dto';

/**
 * Runtime access to a business's Retention V2 configuration.
 *
 * No controller or CRUD yet — the workers only need to read a valid config, and
 * the schema defaults already encode the product rules. A business that has
 * never been configured still gets a usable engine (REMINDER + CONTROL, no
 * economics), which is what makes progressive activation possible.
 */
@Injectable()
export class RetentionSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the business's settings, creating the default row on first use.
   *
   * Idempotent under concurrency: `businessId` is unique, so two workers racing
   * to create the row end up with one, and the loser reads the winner's.
   */
  async getOrCreate(businessId: string): Promise<RetentionSettings> {
    const existing = await this.prisma.retentionSettings.findUnique({
      where: { businessId },
    });
    if (existing) return existing;

    try {
      // All columns have schema defaults, so an empty create is the whole
      // "safe defaults" story — no duplicated constant list to drift.
      return await this.prisma.retentionSettings.create({
        data: { businessId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.retentionSettings.findUnique({
          where: { businessId },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }

  /**
   * Applies a partial update, validating the one cross-field rule the DTO
   * cannot express alone: the sending window must not be empty. Every other
   * field is independently valid by construction (DTO ranges).
   */
  async update(
    businessId: string,
    patch: UpdateRetentionSettingsDto,
  ): Promise<RetentionSettings> {
    const current = await this.getOrCreate(businessId);

    const nextStart = patch.sendingHourStart ?? current.sendingHourStart;
    const nextEnd = patch.sendingHourEnd ?? current.sendingHourEnd;
    if (nextStart >= nextEnd) {
      throw new BadRequestException(
        'sendingHourStart must be before sendingHourEnd',
      );
    }

    const nextMinVisits =
      patch.rewardGoalMinVisits ?? current.rewardGoalMinVisits;
    const nextMaxVisits =
      patch.rewardGoalMaxVisits ?? current.rewardGoalMaxVisits;
    if (
      nextMinVisits !== null &&
      nextMaxVisits !== null &&
      nextMinVisits > nextMaxVisits
    ) {
      throw new BadRequestException(
        'rewardGoalMinVisits must not be greater than rewardGoalMaxVisits',
      );
    }

    return this.prisma.retentionSettings.update({
      where: { businessId },
      data: patch,
    });
  }

  /**
   * True when ANY cap — quantity or monetary — is configured. This is
   * exactly the condition `RetentionBudgetService.checkWithinCaps` uses to
   * leave deny-by-default: with neither cap set, no automated incentive can
   * ever be issued, no matter how many benefits are authorized.
   */
  hasIncentiveBudgetConfigured(
    settings: Pick<
      RetentionSettings,
      'maxAutomatedIncentivesPerMonth' | 'maxEstimatedIncentiveCostPerMonth'
    >,
  ): boolean {
    return (
      settings.maxAutomatedIncentivesPerMonth !== null ||
      settings.maxEstimatedIncentiveCostPerMonth !== null
    );
  }

  /**
   * Guards against the exact contradiction this closes: a benefit marked
   * "authorized for reactivation" that can never actually be issued because
   * no budget cap exists. Called by every path that can turn a benefit's
   * `automationEligible` on — Notificaciones' `updateAutomations` and
   * Programa's `BenefitsService.setRetentionBridge` — so the two never
   * diverge on this rule.
   *
   * `proposedMonthlyLimit`, when given, is treated as "a cap is being set in
   * this same call" even before it is persisted — this is what lets the
   * owner authorize a benefit and configure the limit in one atomic action
   * instead of being blocked on a chicken-and-egg order of operations.
   */
  async assertBudgetReadyToAuthorize(
    businessId: string,
    proposedMonthlyLimit?: number,
  ): Promise<void> {
    if (proposedMonthlyLimit !== undefined) return;
    const settings = await this.getOrCreate(businessId);
    if (!this.hasIncentiveBudgetConfigured(settings)) {
      throw new BadRequestException(
        'Configurá un límite mensual de beneficios automáticos antes de autorizar uno para reactivación (Notificaciones → Te extrañamos).',
      );
    }
  }

  /**
   * Whether the owner has authorized any active variant that carries an
   * incentive without configuring either budget cap — the exact situation
   * Fase C.5 §6 requires the UI to warn about before automation is turned on.
   * Booleans only: the wording belongs to the client, not the API.
   */
  async budgetWarning(businessId: string): Promise<{
    hasIncentiveBearingVariants: boolean;
    budgetConfigured: boolean;
  }> {
    const settings = await this.getOrCreate(businessId);
    const budgetConfigured = this.hasIncentiveBudgetConfigured(settings);

    const incentiveVariant = await this.prisma.retentionVariant.findFirst({
      where: {
        businessId,
        active: true,
        strategyType: {
          in: [
            RetentionStrategyType.SOFT_BENEFIT,
            RetentionStrategyType.STRONG_BENEFIT,
          ],
        },
        incentiveDefinition: { active: true, automationEligible: true },
        experiment: {
          status: {
            in: [
              RetentionExperimentStatus.DRAFT,
              RetentionExperimentStatus.RUNNING,
            ],
          },
        },
      },
      select: { id: true },
    });

    return {
      hasIncentiveBearingVariants: incentiveVariant !== null,
      budgetConfigured,
    };
  }

  /**
   * True when the local time in the business timezone falls inside the
   * configured sending window. Checked at send time, not at evaluation: the
   * two can be hours apart.
   */
  isWithinSendingWindow(
    settings: Pick<
      RetentionSettings,
      'sendingHourStart' | 'sendingHourEnd' | 'allowedSendingDays'
    >,
    timezone: string,
    now: Date,
  ): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    }).formatToParts(now);

    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const weekdayLabel = parts.find((p) => p.type === 'weekday')?.value ?? '';
    // ISO weekday: Monday = 1 … Sunday = 7.
    const isoWeekday =
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekdayLabel) +
      1;

    if (isoWeekday < 1) return false;
    if (
      settings.allowedSendingDays.length > 0 &&
      !settings.allowedSendingDays.includes(isoWeekday)
    ) {
      return false;
    }

    return hour >= settings.sendingHourStart && hour < settings.sendingHourEnd;
  }
}
