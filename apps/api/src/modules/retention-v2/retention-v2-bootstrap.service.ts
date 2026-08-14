import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  RetentionExperimentStatus,
  RetentionObjective,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionSettingsService } from './retention-settings.service';
import { RetentionExperimentsAdminService } from './retention-experiments-admin.service';
import {
  computeDesiredVariants,
  shapesMatch,
  RECOVERY_OBJECTIVES,
  type VariantShape,
} from './retention-v2-bootstrap-plan';

/**
 * Makes "Te extrañamos ON" / "Cerca del premio ON" actually mean something
 * for a self-service business, without the owner — or Platform Admin — ever
 * touching an experiment.
 *
 * The gap this closes: `RetentionExperiment` rows were only ever created by
 * hand (Platform Admin CRUD or simulation fixtures — see
 * `RetentionExperimentService`'s own docstring). A self-service business
 * could have the kill switch on, the automation flag on, and a working
 * channel, and Retention V2 would still recruit nobody, because
 * `findUsableRunning` had nothing to find.
 *
 * This service does not replace `RetentionExperimentsAdminService` — it is a
 * caller of it. Every actual write (create/addVariant/start/finish) goes
 * through that service, so validation (allocation rules, incentive
 * authorization, engine-readiness) is never duplicated here.
 *
 * One objective at a time, one experiment at a time:
 *  - "Te extrañamos" needs up to three experiments running in parallel
 *    (SECOND_VISIT, AT_RISK_RECOVERY, INACTIVE_RECOVERY) — one per objective,
 *    because `RetentionExperiment.objective` is a single scalar field, not a
 *    list, and `resolveApplicable` picks by objective.
 *  - "Cerca del premio" is exactly one experiment, objective
 *    REWARD_GOAL_PROGRESS.
 *
 * A business's "generation" of an objective's experiment changes only when
 * the desired variant shape changes (a benefit gets authorized or
 * de-authorized) — see `computeDesiredVariants`/`shapesMatch`. Nothing here
 * ever mutates a RUNNING experiment's variants directly: the model does not
 * allow it (`RetentionExperimentsAdminService.requireDraft`), and mutating a
 * live arm's meaning after customers were already bucketed would make
 * results unreproducible. Instead, the old generation is finished
 * (COMPLETED, never deleted — its assignments/outcomes/history stay exactly
 * as they were) and a new DRAFT is built, populated and started to replace it.
 */

export type BootstrapObjectiveAction =
  | 'already_correct'
  | 'created'
  | 'replaced_generation'
  | 'left_platform_admin_managed'
  | 'skipped_engine_not_ready';

export interface BootstrapObjectiveResult {
  objective: RetentionObjective;
  action: BootstrapObjectiveAction;
  experimentId?: string;
}

@Injectable()
export class RetentionV2BootstrapService {
  private readonly logger = new Logger(RetentionV2BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: RetentionSettingsService,
    private readonly admin: RetentionExperimentsAdminService,
  ) {}

  /**
   * Idempotent. Safe to call as many times as a caller likes — a business
   * that already has everything it needs costs one settings read and a
   * handful of no-op experiment reads, nothing more.
   *
   * Ensures ONLY the objectives the business's current settings actually
   * call for — sellos off means no REWARD_GOAL_PROGRESS setup is created or
   * touched, and `automaticCampaignsEnabled` off means no recovery setup is
   * touched either (see §9 — this must never run unconditionally on a GET).
   */
  async ensureDefaultRetentionSetup(
    businessId: string,
  ): Promise<BootstrapObjectiveResult[]> {
    const [business, settings] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          experienceVersion: true,
          isActive: true,
          retentionEngineV2Enabled: true,
        },
      }),
      this.settings.getOrCreate(businessId),
    ]);

    // LEGACY (or any non-CHECKIN_V2 business) never gets V2 infrastructure —
    // this mirrors the exact same guard `RetentionV2EvaluateService.
    // findOwnedBusinesses` already uses to decide which businesses it owns.
    if (
      !business ||
      business.experienceVersion !== 'CHECKIN_V2' ||
      !business.isActive
    ) {
      return [];
    }

    const results: BootstrapObjectiveResult[] = [];

    if (settings.automaticCampaignsEnabled) {
      const authorizedIncentiveIds =
        await this.authorizedIncentiveIds(businessId);
      for (const objective of RECOVERY_OBJECTIVES) {
        results.push(
          await this.ensureObjective(
            businessId,
            objective,
            settings.controlGroupPercent,
            authorizedIncentiveIds,
          ),
        );
      }
    }

    // Sellos off means "cerca del premio" is not just disabled, it doesn't
    // apply — no REWARD_GOAL_PROGRESS setup gets created for a business that
    // has no tarjeta at all (see the Notificaciones/Sellos gate this mirrors).
    if (settings.progressReminderEnabled && settings.rewardGoalsEnabled) {
      results.push(
        await this.ensureObjective(
          businessId,
          RetentionObjective.REWARD_GOAL_PROGRESS,
          settings.controlGroupPercent,
          [],
        ),
      );
    }

    return results;
  }

  private async authorizedIncentiveIds(businessId: string): Promise<string[]> {
    const rows = await this.prisma.retentionIncentiveDefinition.findMany({
      where: { businessId, active: true, automationEligible: true },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Ensures ONE objective has a valid, RUNNING, self-service-managed
   * experiment matching the desired shape — or does nothing, for any of
   * three good reasons (already correct / a human is managing this /
   * the engine genuinely cannot start it yet).
   *
   * Serialized per (business, objective) via a Postgres advisory lock —
   * same pattern `IncentiveIssuerService`/`RetentionBudgetService` already
   * use — so two concurrent callers (e.g. onboarding finishing while the
   * owner is also toggling Notificaciones) can never both create a second,
   * competing RUNNING experiment for the same objective.
   */
  private async ensureObjective(
    businessId: string,
    objective: RetentionObjective,
    controlPercent: number,
    authorizedIncentiveIds: string[],
  ): Promise<BootstrapObjectiveResult> {
    const lockKey = `retention-v2-bootstrap:${businessId}:${objective}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`,
      );

      const existing = await tx.retentionExperiment.findMany({
        where: { businessId, objective },
        include: {
          variants: {
            where: { active: true },
            select: { strategyType: true, incentiveDefinitionId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const platformManaged = existing.find(
        (e) =>
          !e.managedBySelfService &&
          e.status === RetentionExperimentStatus.RUNNING,
      );
      if (platformManaged) {
        // A human is already running something here — never compete with it,
        // never replace it. See §15.
        return { objective, action: 'left_platform_admin_managed' as const };
      }

      const current = existing.find(
        (e) =>
          e.managedBySelfService &&
          e.status === RetentionExperimentStatus.RUNNING,
      );

      const desired = computeDesiredVariants(
        objective,
        controlPercent,
        authorizedIncentiveIds,
      );
      const desiredShape: VariantShape[] = desired.map((d) => ({
        strategyType: d.strategyType,
        incentiveDefinitionId: d.incentiveDefinitionId,
      }));

      if (current && shapesMatch(desiredShape, current.variants)) {
        return {
          objective,
          action: 'already_correct' as const,
          experimentId: current.id,
        };
      }

      // Everything below writes through the outer transaction's client (`tx`)
      // by constructing the admin service against it — same PrismaService
      // interface, scoped to this transaction, so a crash mid-sequence rolls
      // back cleanly instead of leaving a half-built generation behind.
      const scopedAdmin = new RetentionExperimentsAdminService(
        tx as unknown as PrismaService,
      );

      if (current) {
        await scopedAdmin.finish(businessId, current.id);
      }

      const experiment = await tx.retentionExperiment.create({
        data: {
          businessId,
          name: `Auto — ${objective}`,
          objective,
          segment: null,
          controlPercent,
          managedBySelfService: true,
        },
      });

      for (const variant of desired) {
        await scopedAdmin.addVariant(businessId, experiment.id, {
          name: variant.name,
          strategyType: variant.strategyType,
          incentiveDefinitionId: variant.incentiveDefinitionId ?? undefined,
          allocationPercent: variant.allocationPercent,
        });
      }

      try {
        await scopedAdmin.start(businessId, experiment.id);
      } catch (error) {
        // The engine flag can theoretically still be off if a caller invokes
        // this outside the expected trigger points (§9) — leave the DRAFT in
        // place rather than crash; the next call (from any trigger) retries
        // cleanly since `current` will still be absent.
        this.logger.warn(
          `Retention V2 bootstrap could not start ${objective} for business ${businessId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return { objective, action: 'skipped_engine_not_ready' as const };
      }

      return {
        objective,
        action: current
          ? ('replaced_generation' as const)
          : ('created' as const),
        experimentId: experiment.id,
      };
    });
  }
}
