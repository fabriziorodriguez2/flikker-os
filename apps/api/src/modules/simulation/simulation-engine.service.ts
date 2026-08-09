import { Injectable } from '@nestjs/common';
import {
  MessageStatus,
  RetentionAssignmentStatus,
  RetentionStrategyType,
  VisitVerificationType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VisitsRepository } from '../checkin/visits.repository';
import { RetentionV2EvaluateService } from '../retention-v2/retention-v2-evaluate.service';
import { RetentionV2SendService } from '../retention-v2/retention-v2-send.service';
import { RetentionOutcomeService } from '../retention-v2/retention-outcome.service';
import { RetentionOptimizationService } from '../retention-v2/retention-optimization.service';
import { RewardGoalSweepService } from '../reward-goals/reward-goal-sweep.service';
import { RewardGoalOrchestratorService } from '../reward-goals/reward-goal-orchestrator.service';
import {
  PERSONA_PROFILES,
  type PersonaProfile,
  type PersonaType,
} from './personas';
import type { ScenarioDefinition } from './scenarios';
import type { SeededCustomer } from './simulation-seeder';
import { FakeWhatsappTransport } from './fake-whatsapp-transport';
import { chance, intBetween, type Rng } from './prng';
import type { SimulationClock } from './simulation-clock';

/**
 * §12 — combines a persona's own ground-truth checkin baseline with the
 * scenario-level override (LOW 0.3 / MEDIUM 0.5 / BASE 0.7 / HIGH 0.9),
 * using BASE as the reference point: the scenario rate scales the
 * persona's baseline proportionally rather than replacing it outright, so
 * a persona that's already more/less diligent than average stays
 * relatively so under LOW/HIGH scenarios too — LOW doesn't make everyone
 * equally unlikely to scan, it makes everyone scan less, in proportion to
 * how likely they already were. Clamped to [0, 1].
 */
const BASE_CHECKIN_COMPLIANCE_RATE = 0.7;

export function combineCheckinComplianceRate(
  personaBaseline: number,
  scenarioRate: number,
): number {
  const scaled =
    personaBaseline * (scenarioRate / BASE_CHECKIN_COMPLIANCE_RATE);
  return Math.min(1, Math.max(0, scaled));
}

/**
 * §13 — how many days a REMINDER/PROGRESS_REMINDER/SOFT_BENEFIT message's
 * ground-truth effect stays "live" after exposure. The persona's own effect
 * value (e.g. PROGRESS_SENSITIVE's 0.22) is spread flat across this window
 * as a daily hazard add-on, so in expectation the total extra returns
 * attributable to ONE message over its whole window ≈ the effect value
 * itself — a deliberate, disclosed modeling choice, not a claim about real
 * customer psychology.
 */
export const EFFECT_WINDOW_DAYS = 10;

/** CONTROL and STRONG_BENEFIT (unused by our 4-variant set) never boost hazard. */
export function personaEffectForStrategy(
  persona: PersonaProfile,
  strategyType: RetentionStrategyType,
): number {
  switch (strategyType) {
    case RetentionStrategyType.REMINDER:
      return persona.reminderEffect;
    case RetentionStrategyType.PROGRESS_REMINDER:
      return persona.progressReminderEffect;
    case RetentionStrategyType.SOFT_BENEFIT:
      return persona.softBenefitEffect;
    default:
      return 0;
  }
}

interface CustomerRuntimeState {
  customerId: string;
  persona: PersonaType;
  /** This customer's own average return cadence — persona average ± jitter, fixed for the run. */
  effectiveCadenceDays: number;
  daysSinceLastReturn: number;
  churned: boolean;
  /** First real Visit for this customer is organic/unattributed, exactly like `CheckinService.register()`. */
  hasEverVisited: boolean;
}

export interface DayResult {
  day: number;
  physicalReturns: number;
  visibleReturns: number;
  newChurns: number;
  assignmentsCreated: number;
  messagesSent: number;
  messagesControl: number;
  messagesSkipped: number;
  messagesDelivered: number;
  messagesRead: number;
  messagesFailed: number;
  outcomesReturned: number;
  rewardGoalsCreated: number;
  rewardGoalsUnlocked: number;
  rewardGoalsRedeemed: number;
  optimizationRunsApplied: number;
  optimizationRunsSkipped: number;
  reviewPrompts: number;
  reviewClicks: number;
}

/**
 * Simulation Center §10/§11/§13 — the day-loop. Reuses the real,
 * unchanged recruitment/send/outcome services exactly as the production
 * cron/worker chain would call them; the only simulation-specific pieces
 * are (a) which businesses exist to find (just the one seeded fictitious
 * business, since this runs inside the isolated DB) and (b) the fake
 * WhatsApp delivery roll, since no real worker ever processes `Message`
 * rows inside this isolated context (§4 — never a real send).
 *
 * Deliberately calls `VisitsRepository.registerVisit()` directly rather
 * than `CheckinService.register()`/`.checkin()` — the real HTTP-facing
 * check-in flow bundles session issuance, QR/token handling, and
 * fire-and-forget calls into real messaging services (welcome message,
 * owner notification, review request), none of which the simulation needs
 * or may safely trigger. `VisitsRepository` is the real, load-bearing
 * persistence logic underneath all of that — dedup, the advisory lock,
 * attribution — reused completely unchanged.
 *
 * Scope decision (disclosed): all `customerCount` customers are seeded
 * up front (the seeder's job) rather than trickling in day by day — "new
 * customer arrivals" (§10 step 1) is treated as already satisfied by
 * seeding a base population.
 *
 * One instance is constructed per isolated run (a fresh Nest context per
 * `bootIsolatedSimulationContext` call), so holding per-run mutable state
 * on `this` is safe — there is never more than one run per instance.
 */
@Injectable()
export class SimulationEngineService {
  private customers = new Map<string, CustomerRuntimeState>();
  private businessId = '';
  private scenario!: ScenarioDefinition;
  private rng!: Rng;
  private whatsapp!: FakeWhatsappTransport;

  constructor(
    private readonly visits: VisitsRepository,
    private readonly prisma: PrismaService,
    private readonly evaluateService: RetentionV2EvaluateService,
    private readonly sendService: RetentionV2SendService,
    private readonly outcomeService: RetentionOutcomeService,
    private readonly rewardGoalSweep: RewardGoalSweepService,
    private readonly rewardGoalOrchestrator: RewardGoalOrchestratorService,
    private readonly optimizationService: RetentionOptimizationService,
  ) {}

  init(
    businessId: string,
    seededCustomers: SeededCustomer[],
    scenario: ScenarioDefinition,
    rng: Rng,
  ): void {
    this.businessId = businessId;
    this.scenario = scenario;
    this.rng = rng;
    this.whatsapp = new FakeWhatsappTransport({
      failureRate: scenario.failureInjection.messageFailureRate,
      deliveredRate: 0.92,
      readRate: 0.65,
    });
    this.customers = new Map(
      seededCustomers.map((customer) => {
        const persona = PERSONA_PROFILES[customer.persona];
        const jitter = intBetween(
          rng,
          -persona.cadenceJitterDays,
          persona.cadenceJitterDays,
        );
        const effectiveCadenceDays = Math.max(
          1,
          persona.averageCadenceDays + jitter,
        );
        const state: CustomerRuntimeState = {
          customerId: customer.id,
          persona: customer.persona,
          effectiveCadenceDays,
          // Random phase offset so the whole population isn't synchronized
          // on the same return day (§14 — noise, not artificial lockstep).
          daysSinceLastReturn: intBetween(rng, 0, effectiveCadenceDays - 1),
          churned: false,
          hasEverVisited: false,
        };
        return [customer.id, state];
      }),
    );
  }

  async runDay(clock: SimulationClock): Promise<DayResult> {
    const now = clock.now();

    // 1. Reward Goals sweep — real, unchanged. Creates new ACTIVE goals for
    // eligible customers (segment/visit-count based); unlock itself happens
    // per-visit in step 6, exactly like the real check-in flow triggers
    // `RewardGoalOrchestratorService.afterVisit` — never in the same pass a
    // goal was created (Fase E §27's "not manufactured on the spot" rule).
    //
    // BUG FOUND during the mandatory runs (§38), fixed here, disclosed in
    // the final report: this sweep used to run AFTER step 3 (send) below.
    // `RetentionV2SendService.sendProgressReminder` SKIPS — permanently,
    // never retried, since SKIPPED is a terminal status — any
    // PROGRESS_REMINDER assignment whose customer has no ACTIVE
    // CustomerRewardGoal *at that exact moment*. Recruitment+send run the
    // same day a customer is first assigned, so with the sweep running
    // AFTER send, a customer's very first goal (created THIS SAME day)
    // was never visible to that day's send attempt — every PROGRESS_REMINDER
    // assignment silently died with zero exposure, for the entire run. In
    // real production this race cannot happen: the sweep and the send
    // worker are independent, asynchronous cron jobs, not one synchronous
    // per-day loop — an artifact of compressing them into a single virtual
    // day here, not a Flikker bug. Running the sweep first is the correct,
    // minimal fix.
    const sweepResult = await this.rewardGoalSweep.runDaily(now, false);

    // 2. Recruitment — real, unchanged. Only ever sees this isolated DB's
    // one fictitious business.
    const evaluateResult = await this.evaluateService.runDaily(now);

    // 3. Send — real, unchanged. Re-validates everything itself; creates a
    // queued Message row per actual send.
    const pending = await this.prisma.retentionAssignment.findMany({
      where: {
        businessId: this.businessId,
        status: RetentionAssignmentStatus.PENDING,
      },
      select: { id: true },
    });
    let messagesSent = 0;
    let messagesControl = 0;
    let messagesSkipped = 0;
    for (const assignment of pending) {
      const outcome = await this.sendService.processAssignment(
        assignment.id,
        now,
      );
      if (outcome.status === 'sent') messagesSent += 1;
      else if (outcome.status === 'control') messagesControl += 1;
      else messagesSkipped += 1;
    }

    // 4. Fake delivery — §4: no real worker ever touches these Message
    // rows in this isolated context, so the simulation drives their
    // terminal status itself, seeded, never 100% success (§14).
    const queuedMessages = await this.prisma.message.findMany({
      where: { businessId: this.businessId, status: MessageStatus.queued },
      select: { id: true },
    });
    let messagesDelivered = 0;
    let messagesRead = 0;
    let messagesFailed = 0;
    for (const message of queuedMessages) {
      const finalStatus = this.whatsapp.simulateSend(this.rng);
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: finalStatus },
      });
      if (finalStatus === MessageStatus.delivered) messagesDelivered += 1;
      else if (finalStatus === MessageStatus.read) messagesRead += 1;
      else if (finalStatus === MessageStatus.failed) messagesFailed += 1;
    }

    // 5. Ground-truth exposure map — §13: which customers currently carry
    // a live message effect, and which strategy it came from. Built from
    // real `RetentionAssignment` rows, exactly the same "exposed" statuses
    // (`SENT`/`OBSERVING`) the real outcome/metrics services use (§4 of
    // `exposure.ts`) — intention-to-treat, not delivery-confirmed.
    const exposureWindowStart = new Date(
      now.getTime() - EFFECT_WINDOW_DAYS * 86_400_000,
    );
    const exposedAssignments = await this.prisma.retentionAssignment.findMany({
      where: {
        businessId: this.businessId,
        status: {
          in: [
            RetentionAssignmentStatus.SENT,
            RetentionAssignmentStatus.OBSERVING,
          ],
        },
        exposedAt: { gte: exposureWindowStart },
      },
      select: {
        customerId: true,
        variant: { select: { strategyType: true } },
      },
    });
    const exposureByCustomer = new Map<string, RetentionStrategyType>();
    for (const assignment of exposedAssignments) {
      exposureByCustomer.set(
        assignment.customerId,
        assignment.variant.strategyType,
      );
    }

    // 6. Physical vs. visible returns (§11), now boosted by any live
    // ground-truth message effect (§13), each visible one immediately
    // checked for a Reward Goal unlock (step 4's counterpart, per-visit).
    let physicalReturns = 0;
    let visibleReturns = 0;
    let newChurns = 0;
    let rewardGoalsUnlocked = 0;
    let reviewPrompts = 0;
    let reviewClicks = 0;

    for (const state of this.customers.values()) {
      if (state.churned) continue;
      state.daysSinceLastReturn += 1;

      const persona = PERSONA_PROFILES[state.persona];

      // A full cycle has elapsed with no return — one churn roll per
      // completed cycle, not one per day, so churn hazard reads as "per
      // cycle" the way the persona profile documents it.
      if (state.daysSinceLastReturn === state.effectiveCadenceDays) {
        if (chance(this.rng, persona.churnHazardPerCycle)) {
          state.churned = true;
          newChurns += 1;
          continue;
        }
      }

      const exposedStrategy = exposureByCustomer.get(state.customerId);
      const effectBonus = exposedStrategy
        ? personaEffectForStrategy(persona, exposedStrategy) /
          EFFECT_WINDOW_DAYS
        : 0;
      const dailyHazard = 1 / state.effectiveCadenceDays + effectBonus;
      if (!chance(this.rng, dailyHazard)) continue;

      physicalReturns += 1;
      state.daysSinceLastReturn = 0;

      const effectiveCheckinRate = combineCheckinComplianceRate(
        persona.baselineCheckinComplianceRate,
        this.scenario.failureInjection.checkinComplianceRate,
      );
      if (!chance(this.rng, effectiveCheckinRate)) {
        // Physical but invisible — no Visit row, ever (§11).
        continue;
      }

      visibleReturns += 1;
      await this.visits.registerVisit({
        businessId: this.businessId,
        customerId: state.customerId,
        sourceId: null,
        verificationType: VisitVerificationType.manual,
        timezone: 'America/Montevideo',
        minHoursBetweenVisits: 8,
        maxVisitsPerDay: 1,
        attribute: state.hasEverVisited,
        now,
      });
      state.hasEverVisited = true;

      // §10/§21 — review prompt/click. Per CLAUDE.md §2, this MVP's reviews
      // are loaded manually (or synced from Google separately) — a "click"
      // here only means the customer followed the prompt link out to
      // Google, never a Review row created directly in Flikker. So this is
      // a pure ground-truth counter, never a DB write, never an input to
      // any other decision — ONLY a reported metric (§21).
      reviewPrompts += 1;
      if (chance(this.rng, persona.reviewClickProbability)) {
        reviewClicks += 1;
      }

      const unlockResult = await this.rewardGoalOrchestrator.afterVisit(
        this.businessId,
        state.customerId,
        'America/Montevideo',
        now,
      );
      if (unlockResult.unlockedNow) rewardGoalsUnlocked += 1;
    }

    // 7. Redemptions — §10's "unlocks/redemptions" step. The real,
    // authenticated redemption flow (`RedemptionService.redeem`) needs a
    // FlikkerAccount session this simulation never creates (disclosed
    // scope decision — that identity/session layer is irrelevant to what
    // Retention V2/Reward Goals/optimization need validated). Instead,
    // mirrors `BenefitsRepository.consumeRedemption`'s own real effect
    // directly: `redeemedAt` set, nothing else — gated by the scenario's
    // seeded `rewardRedemptionRate` (§19), never 100%.
    //
    // BUG FOUND during the mandatory runs (§38), fixed here, disclosed in
    // the final report: this query has no filter on WHICH system issued
    // each `BenefitParticipation` — Reward Goals (`rewardGoal` back-relation
    // non-null) and Retention V2's SOFT_BENEFIT arm (`retentionAssignment`
    // back-relation non-null) each create their own dedicated
    // `BenefitParticipation`, and both are eligible for this same redemption
    // roll. Every one of them still gets redeemed here (correct — a
    // SOFT_BENEFIT incentive is just as real a benefit as a reward-goal
    // unlock, and leaving it perpetually unredeemed would be its own
    // realism bug), but the count was being accumulated into a single
    // variable literally named `rewardGoalsRedeemed` regardless of origin
    // — silently folding SOFT_BENEFIT redemptions into a reward-goal
    // metric. Evidence: one run showed `rewardGoalsRedeemed(480) >
    // rewardGoalsUnlocked(408)`, impossible if the field were exclusively
    // reward-goal redemptions (each unlock creates at most one
    // participation). Fixed by keeping the same redemption behavior for
    // every participation, but only counting the ones actually linked to a
    // reward goal into `rewardGoalsRedeemed`.
    const unredeemed = await this.prisma.benefitParticipation.findMany({
      where: { businessId: this.businessId, redeemedAt: null },
      select: {
        id: true,
        expiresAt: true,
        rewardGoal: { select: { id: true } },
      },
    });
    let rewardGoalsRedeemed = 0;
    for (const participation of unredeemed) {
      if (participation.expiresAt && participation.expiresAt < now) continue;
      if (
        !chance(this.rng, this.scenario.failureInjection.rewardRedemptionRate)
      ) {
        continue;
      }
      await this.prisma.benefitParticipation.update({
        where: { id: participation.id },
        data: { redeemedAt: now },
      });
      if (participation.rewardGoal) rewardGoalsRedeemed += 1;
    }

    // 8. Outcomes — real, unchanged. Reads whatever Visits step 6 (today)
    // and prior days already created.
    const outcomeResult = await this.outcomeService.runOnce(now);

    // 9. Safe Auto-Optimization — real, unchanged sweep (Fase G). Only ever
    // touches experiments whose OWN `optimizationMode` is AUTOMATIC; for
    // ASSISTED/OFF scenarios `findAutomaticCandidates()` finds nothing and
    // this is a safe no-op. Budget headroom (§10's "budget" step) is
    // already enforced INSIDE this real service's own eligibility check —
    // no separate call needed for it.
    const optimizationResult =
      await this.optimizationService.sweepAutomatic(now);

    return {
      day: clock.currentVirtualDay,
      physicalReturns,
      visibleReturns,
      newChurns,
      assignmentsCreated: evaluateResult.assigned,
      messagesSent,
      messagesControl,
      messagesSkipped,
      messagesDelivered,
      messagesRead,
      messagesFailed,
      outcomesReturned: outcomeResult.returned + outcomeResult.confirmed,
      rewardGoalsCreated: sweepResult.created,
      rewardGoalsUnlocked,
      rewardGoalsRedeemed,
      optimizationRunsApplied: optimizationResult.applied,
      optimizationRunsSkipped: optimizationResult.skipped,
      reviewPrompts,
      reviewClicks,
    };
  }

  get customerCount(): number {
    return this.customers.size;
  }

  get churnedCount(): number {
    let count = 0;
    for (const state of this.customers.values()) if (state.churned) count++;
    return count;
  }
}
