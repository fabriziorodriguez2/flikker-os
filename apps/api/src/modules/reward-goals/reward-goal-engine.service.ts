import { Injectable, Logger } from '@nestjs/common';
import { CustomerSegment, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isValidToday } from '../retention-v2/incentive-issuer.service';
import {
  DECISION_CODES,
  RetentionDecisionLogService,
} from '../retention-v2/retention-decision-log.service';
import { PlansService } from '../plans/plans.service';
import { decideRewardGoal, type RewardGoalDecision } from './reward-goal-rules';

/** Goals that still represent a live promise — not yet redeemed or closed out. */
const PROMISED_STATUSES: RewardGoalStatus[] = [
  RewardGoalStatus.ACTIVE,
  RewardGoalStatus.UNLOCKED,
];

export interface RewardGoalEvaluationContext {
  businessId: string;
  customerId: string;
  segment: CustomerSegment;
  visitCount: number;
  timezone: string;
  now: Date;
}

/**
 * Decides — and, unless told otherwise, creates — a Reward Goal for one
 * customer (Fase E §8/§9/§10). Split from `decideRewardGoal` (pure) exactly
 * like Retention V2 splits `evaluateEligibility` from its evaluate service:
 * this class only gathers facts from the database and hands them to the pure
 * function, so the actual decision stays unit-testable without one.
 */
@Injectable()
export class RewardGoalEngineService {
  private readonly logger = new Logger(RewardGoalEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: RetentionDecisionLogService,
    private readonly plans: PlansService,
  ) {}

  /**
   * Evaluates and, for a real (non-dry-run) call, applies the decision.
   * `dryRun: true` returns exactly what a live call would have decided
   * without writing a `CustomerRewardGoal` row or touching any capacity
   * counter — Fase E §32.
   */
  async evaluate(
    context: RewardGoalEvaluationContext,
    options: { dryRun: boolean } = { dryRun: false },
  ): Promise<RewardGoalDecision> {
    const settings = await this.prisma.retentionSettings.findUnique({
      where: { businessId: context.businessId },
      select: {
        rewardGoalsEnabled: true,
        rewardGoalCooldownDays: true,
        rewardGoalMinVisits: true,
        rewardGoalMaxVisits: true,
        maxPromisedRewardGoalsPerIncentive: true,
        dryRunEnabled: true,
      },
    });

    if (!settings?.rewardGoalsEnabled) {
      return { action: 'NO_GOAL', reasonCode: 'REWARD_GOALS_DISABLED' };
    }

    // The business-level pilot switch (Fase E §32) forces dry-run regardless
    // of what the caller asked for — including the per-Visit trigger, not
    // just the periodic sweep. A business observing Retention V2 is observing
    // Reward Goals too; the two share one "nothing real happens yet" switch.
    const effectiveDryRun = options.dryRun || settings.dryRunEnabled;

    const [hasActiveGoal, cooldownActive, eligibleIncentiveIds] =
      await Promise.all([
        this.hasActiveGoal(context.businessId, context.customerId),
        this.isCooldownActive(
          context.businessId,
          context.customerId,
          settings.rewardGoalCooldownDays,
          context.now,
        ),
        this.findEligibleIncentiveIds(
          context.businessId,
          context.timezone,
          context.now,
          settings.maxPromisedRewardGoalsPerIncentive,
        ),
      ]);

    let decision = decideRewardGoal({
      segment: context.segment,
      hasActiveGoal,
      cooldownActive,
      eligibleIncentiveIds,
      overrideMinVisits: settings.rewardGoalMinVisits,
      overrideMaxVisits: settings.rewardGoalMaxVisits,
    });

    // Self-service FREE (tarjeta de sellos): tope de clientes participantes.
    // Se chequea DESPUÉS de que las reglas puras ya decidieron crear una
    // tarjeta — nunca antes — porque un cliente que ya participaba jamás se
    // bloquea acá (`canAddParticipant` lo deja pasar de entrada); esto solo
    // frena ALTAS nuevas cuando el negocio ya está en el límite. Sin
    // Subscription (LEGACY / Platform Admin / cualquier negocio anterior a
    // esta feature) nunca se activa.
    if (decision.action === 'CREATE_GOAL') {
      const canAdd = await this.plans.canAddParticipant(
        context.businessId,
        context.customerId,
      );
      if (!canAdd) {
        decision = {
          action: 'NO_GOAL',
          reasonCode: 'PARTICIPANT_LIMIT_REACHED',
        };
      }
    }

    await this.logDecision(context, decision, effectiveDryRun);

    if (decision.action === 'CREATE_GOAL' && !effectiveDryRun) {
      await this.createGoal(context, decision);
    }

    return decision;
  }

  /**
   * Idempotent under concurrency: the partial unique index
   * `customer_reward_goals_one_active_per_customer` is what actually
   * prevents two workers from both creating an ACTIVE goal for the same
   * customer — this just recovers gracefully from that race instead of
   * throwing.
   */
  private async createGoal(
    context: RewardGoalEvaluationContext,
    decision: {
      incentiveDefinitionId: string;
      targetAdditionalVisits: number;
      reasonCode: string;
    },
  ) {
    try {
      return await this.prisma.customerRewardGoal.create({
        data: {
          businessId: context.businessId,
          customerId: context.customerId,
          incentiveDefinitionId: decision.incentiveDefinitionId,
          startingVisitCount: context.visitCount,
          targetAdditionalVisits: decision.targetAdditionalVisits,
          reasonCode: decision.reasonCode,
          segmentAtCreation: context.segment,
          createdAt: context.now,
          activatedAt: context.now,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Reward goal creation raced for customer ${context.customerId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.prisma.customerRewardGoal.findFirst({
        where: {
          businessId: context.businessId,
          customerId: context.customerId,
          status: RewardGoalStatus.ACTIVE,
        },
      });
    }
  }

  /**
   * `PROMISED_STATUSES` (ACTIVE + UNLOCKED), no solo ACTIVE: un goal
   * UNLOCKED todavía tiene un premio real esperando canje — permitir un
   * ciclo nuevo mientras ese premio sigue sin canjearse dejaría dos
   * promesas abiertas para el mismo cliente al mismo tiempo.
   */
  private hasActiveGoal(
    businessId: string,
    customerId: string,
  ): Promise<boolean> {
    return this.prisma.customerRewardGoal
      .findFirst({
        where: { businessId, customerId, status: { in: PROMISED_STATUSES } },
        select: { id: true },
      })
      .then((row) => row !== null);
  }

  /**
   * Cooldown since the customer's most recently CLOSED goal (unlocked,
   * redeemed, expired, or cancelled) — the guard against immediately
   * re-creating a new goal right after finishing one (Fase E §33).
   * `updatedAt` is used as the closing timestamp: every terminal transition
   * is itself a write, so it always moves forward with the closure.
   */
  private async isCooldownActive(
    businessId: string,
    customerId: string,
    cooldownDays: number,
    now: Date,
  ): Promise<boolean> {
    const lastClosed = await this.prisma.customerRewardGoal.findFirst({
      where: {
        businessId,
        customerId,
        status: { not: RewardGoalStatus.ACTIVE },
      },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    if (!lastClosed) return false;

    const elapsedDays =
      (now.getTime() - lastClosed.updatedAt.getTime()) / 86_400_000;
    return elapsedDays < cooldownDays;
  }

  /**
   * Incentives the engine is authorized to promise right now (Fase E §10):
   * active, opted into reward goals specifically (not just automation),
   * valid today, and with room left under the owner's promised-capacity cap
   * and the incentive's own total-redemption cap.
   */
  private async findEligibleIncentiveIds(
    businessId: string,
    timezone: string,
    now: Date,
    maxPromisedPerIncentive: number | null,
  ): Promise<string[]> {
    const candidates = await this.prisma.retentionIncentiveDefinition.findMany({
      where: { businessId, active: true, rewardGoalEligible: true },
      select: { id: true, validDays: true, maxTotalRedemptions: true },
    });

    const eligible: string[] = [];
    for (const candidate of candidates) {
      if (!isValidToday(candidate.validDays, timezone, now)) continue;

      const promised = await this.prisma.customerRewardGoal.count({
        where: {
          incentiveDefinitionId: candidate.id,
          status: { in: PROMISED_STATUSES },
        },
      });
      if (
        maxPromisedPerIncentive !== null &&
        promised >= maxPromisedPerIncentive
      ) {
        continue;
      }

      if (candidate.maxTotalRedemptions !== null) {
        const redeemed = await this.prisma.customerRewardGoal.count({
          where: {
            incentiveDefinitionId: candidate.id,
            status: RewardGoalStatus.REDEEMED,
          },
        });
        // Promised + already-redeemed must never together exceed the hard
        // cap — a goal promised now could still be redeemed later, and the
        // incentive must be able to honour it when that happens.
        if (promised + redeemed >= candidate.maxTotalRedemptions) continue;
      }

      eligible.push(candidate.id);
    }
    return eligible;
  }

  private async logDecision(
    context: RewardGoalEvaluationContext,
    decision: RewardGoalDecision,
    dryRun: boolean,
  ) {
    // The steady state ("customer already has one") would drown the audit
    // trail if logged on every evaluation — same rule Retention V2 applies to
    // ALREADY_ASSIGNED.
    if (
      decision.action === 'NO_GOAL' &&
      decision.reasonCode === 'ALREADY_HAS_ACTIVE_GOAL'
    ) {
      return;
    }

    const decisionCode = dryRun
      ? DECISION_CODES.DRY_RUN_WOULD_CREATE_REWARD_GOAL
      : decision.action === 'CREATE_GOAL'
        ? DECISION_CODES.REWARD_GOAL_CREATED
        : DECISION_CODES.REWARD_GOAL_SKIPPED;

    if (dryRun && decision.action !== 'CREATE_GOAL') return; // dry run only logs what it WOULD create

    await this.decisions.record({
      businessId: context.businessId,
      customerId: context.customerId,
      decisionCode,
      metadata:
        decision.action === 'CREATE_GOAL'
          ? {
              incentiveDefinitionId: decision.incentiveDefinitionId,
              targetAdditionalVisits: decision.targetAdditionalVisits,
              reasonCode: decision.reasonCode,
              segment: context.segment,
            }
          : { reasonCode: decision.reasonCode, segment: context.segment },
    });
  }
}
