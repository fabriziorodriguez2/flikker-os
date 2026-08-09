import { Injectable } from '@nestjs/common';
import {
  BenefitType,
  RetentionExperimentStatus,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { pickPersona, type PersonaType } from './personas';
import type { ExperimentVariantCode, ScenarioDefinition } from './scenarios';
import type { Rng } from './prng';

export interface SeededCustomer {
  id: string;
  /** §8 — the ground truth. Returned to the caller only, never persisted. */
  persona: PersonaType;
}

export interface SeededSimulation {
  businessId: string;
  experimentId: string;
  // Partial — a two-arm scenario (pre-piloto fix §13/§14) only ever seeds
  // CONTROL plus one challenger.
  variantIdByCode: Partial<Record<ExperimentVariantCode, string>>;
  incentiveIdByCode: Record<string, string>;
  customers: SeededCustomer[];
}

const STRATEGY_BY_VARIANT: Record<
  ExperimentVariantCode,
  RetentionStrategyType
> = {
  CONTROL: RetentionStrategyType.CONTROL,
  REMINDER: RetentionStrategyType.REMINDER,
  PROGRESS_REMINDER: RetentionStrategyType.PROGRESS_REMINDER,
  SOFT_BENEFIT: RetentionStrategyType.SOFT_BENEFIT,
};

/**
 * Simulation Center §7/§8/§10 (setup phase) — creates one fictitious
 * business, its retention experiment + variants + incentives, and N
 * fictitious customers, entirely inside whatever database `PrismaService`
 * is currently bound to (the isolated simulation context, per
 * `bootIsolatedSimulationContext` — this class never checks or cares which
 * database that is, isolation is the caller's job).
 *
 * The experiment is created directly with `status: RUNNING` rather than
 * going through `RetentionExperimentsAdminService.start()` — that service
 * lives in `RetentionV2Module` but is not exported, and every scenario
 * definition already guarantees a valid allocation/incentive set (§6
 * enforces this with tests), so there is nothing that admin-only validation
 * would catch here. `RetentionV2EvaluateService` (the real, unchanged
 * worker) only ever reads `status: RUNNING` — it has no way to tell the
 * difference.
 *
 * §8 — personas are assigned here and returned to the caller as plain data;
 * nothing about them is ever written to `Customer` or any Retention Engine
 * table. This is the one place that ground truth exists in code.
 */
@Injectable()
export class SimulationSeeder {
  constructor(private readonly prisma: PrismaService) {}

  async seed(
    def: ScenarioDefinition,
    rng: Rng,
    now: Date,
    runLabel: string,
  ): Promise<SeededSimulation> {
    const business = await this.prisma.business.create({
      data: {
        name: `Simulación ${runLabel}`,
        slug: `sim-${runLabel}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        isActive: true,
        experienceVersion: 'CHECKIN_V2',
        retentionEngineV2Enabled: def.business.retentionEngineV2Enabled,
      },
      select: { id: true },
    });
    const businessId = business.id;

    await this.prisma.retentionSettings.create({
      data: {
        businessId,
        averageTicketAmount: def.business.averageTicketAmount,
        estimatedMarginPercent: def.business.estimatedMarginPercent,
        automaticCampaignsEnabled: def.business.automaticCampaignsEnabled,
        rewardGoalsEnabled: def.business.rewardGoalsEnabled,
        optimizationMode: def.business.optimizationMode,
        maxAutomatedIncentivesPerMonth:
          def.business.budgetCaps.maxAutomatedIncentivesPerMonth,
        maxEstimatedIncentiveCostPerMonth:
          def.business.budgetCaps.maxEstimatedIncentiveCostPerMonth,
      },
    });

    const incentiveIdByCode: Record<string, string> = {};
    for (const incentive of def.incentives) {
      const created = await this.prisma.retentionIncentiveDefinition.create({
        data: {
          businessId,
          name: incentive.label,
          type: BenefitType.discount,
          active: true,
          automationEligible: true,
          // BUG FOUND during the mandatory runs (§38), fixed here, disclosed
          // in the final report: `rewardGoalEligible` is a SEPARATE opt-in
          // from `automationEligible` (Fase E §1 — deliberately so, a real
          // business may want Retention V2 automation without Reward
          // Goals, or vice versa). Omitting it left every scenario's
          // `rewardGoalsCreated` at 0 for the whole run — not a Flikker
          // bug; `RewardGoalEngineService.findEligibleIncentiveIds` was
          // correctly refusing to promise a reward against an incentive
          // that never opted into the Reward Goal program. Every scenario
          // sets `business.rewardGoalsEnabled` (see scenarios.ts), so the
          // seeded incentives must actually opt in too, or that flag is
          // never genuinely exercised.
          rewardGoalEligible: true,
          percentageValue: incentive.percentageValue ?? null,
        },
        select: { id: true },
      });
      incentiveIdByCode[incentive.code] = created.id;
    }
    // §7's SOFT_BENEFIT variant needs exactly one active, automation-eligible
    // incentive to point at.
    //
    // BUG FOUND during the mandatory runs (§38), fixed here, disclosed in
    // the final report: this used to take `Object.values(...)[0]` — in
    // practice always "UPGRADE" (the first entry in `DEFAULT_INCENTIVES`),
    // which carries no `percentageValue`/`fixedValue`/`estimatedCost` at
    // all. `estimateIncentiveCost` (real, unchanged) correctly returns
    // null when it cannot estimate — which silently zeroed out
    // `promotionalCost`/`estimatedIncrementalRevenue` for the ENTIRE
    // SOFT_BENEFIT arm in every run, even once it was actually being
    // exercised. Picking the percentage-off incentive specifically (it
    // has a real `percentageValue`, estimable against the business's own
    // `averageTicketAmount`) is what makes the economics section mean
    // anything at all; falling back to "first available" only if that
    // specific one is somehow absent.
    const softBenefitIncentiveId =
      incentiveIdByCode['PERCENT_OFF_10'] ??
      Object.values(incentiveIdByCode)[0] ??
      null;

    const experiment = await this.prisma.retentionExperiment.create({
      data: {
        businessId,
        name: `Simulación ${runLabel}`,
        // Pre-piloto fix (§1/§2) — every scenario before this fix implicitly
        // used AT_RISK_RECOVERY; only REWARD_PROGRESS overrides this.
        objective: def.objective ?? RetentionObjective.AT_RISK_RECOVERY,
        status: RetentionExperimentStatus.RUNNING,
        startAt: now,
      },
      select: { id: true },
    });

    const variantIdByCode = {} as Partial<
      Record<ExperimentVariantCode, string>
    >;
    for (const [code, percent] of Object.entries(def.experimentAllocation) as [
      ExperimentVariantCode,
      number,
    ][]) {
      const variant = await this.prisma.retentionVariant.create({
        data: {
          businessId,
          experimentId: experiment.id,
          name: code,
          strategyType: STRATEGY_BY_VARIANT[code],
          allocationPercent: percent,
          incentiveDefinitionId:
            code === 'SOFT_BENEFIT' ? softBenefitIncentiveId : null,
        },
        select: { id: true },
      });
      variantIdByCode[code] = variant.id;
    }

    const customers: SeededCustomer[] = [];
    for (let i = 0; i < def.customerCount; i++) {
      const persona = pickPersona(rng, def.personaMix);
      const created = await this.prisma.customer.create({
        data: {
          businessId,
          name: `Cliente simulado ${i + 1}`,
          phoneE164: `+598${runLabel.replace(/\D/g, '').slice(-6).padStart(6, '0')}${String(i).padStart(4, '0')}`,
          origin: 'qr',
        },
        select: { id: true },
      });
      customers.push({ id: created.id, persona });
    }

    return {
      businessId,
      experimentId: experiment.id,
      variantIdByCode,
      incentiveIdByCode,
      customers,
    };
  }
}
