import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerEventType, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BenefitsRepository } from '../benefits/benefits.repository';
import { VisitsRepository } from './visits.repository';
import { CustomerEventsRepository } from './customer-events.repository';
import { isCheckinV2 } from '../../common/experience/experience.util';
import {
  DECISION_CODES,
  RetentionDecisionLogService,
} from '../retention-v2/retention-decision-log.service';

@Injectable()
export class RedemptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly benefits: BenefitsRepository,
    private readonly visits: VisitsRepository,
    private readonly events: CustomerEventsRepository,
    private readonly decisions: RetentionDecisionLogService,
  ) {}

  /**
   * Read-only "scan → preview" step — see PreviewRedemptionResult. Used by
   * the employee-facing camera scan (Piloto V2 #5): shows "Beneficio: X /
   * Cliente: Y" before anything is consumed. Manual code entry skips this
   * and calls `redeem` directly, same as always.
   */
  async preview(businessId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new NotFoundException('Código inválido');

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { experienceVersion: true },
    });
    if (!business || !isCheckinV2(business)) throw new NotFoundException();

    const result = await this.benefits.previewRedemption(businessId, code);
    if (result.status === 'not_found') {
      throw new NotFoundException('Código no encontrado');
    }
    if (result.status === 'already') {
      throw new ConflictException('Este beneficio ya fue canjeado');
    }
    if (result.status === 'expired') {
      throw new ConflictException('Este código venció');
    }
    return {
      benefitTitle: result.benefitTitle,
      customerName: result.customerName,
    };
  }

  /**
   * Staff validates a redemption code. In one flow it: (1) atomically consumes
   * the code (no double redemption), (2) records/upgrades the visit to
   * confirmed_redemption, (3) links the visit and emits the timeline event.
   * The authoritative "used once" guarantee is the atomic consume in step 1.
   */
  async redeem(businessId: string, userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new NotFoundException('Código inválido');

    // V2-only: the redemption produces a Visit and a confirmed_redemption
    // attribution, neither of which may exist for a legacy business. Checked
    // before consuming so a legacy call never burns the code either. The legacy
    // benefits module (Benefit/BenefitParticipation) is untouched by this.
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true, experienceVersion: true },
    });
    if (!business || !isCheckinV2(business)) throw new NotFoundException();

    const consumed = await this.benefits.consumeRedemption(
      businessId,
      code,
      userId,
    );
    if (consumed.status === 'not_found') {
      throw new NotFoundException('Código no encontrado');
    }
    if (consumed.status === 'already') {
      throw new ConflictException('Este beneficio ya fue canjeado');
    }
    if (consumed.status === 'expired') {
      throw new ConflictException('Este código venció');
    }

    const visit = await this.visits.registerRedemptionVisit({
      businessId,
      customerId: consumed.customerId,
      timezone: business?.timezone ?? 'America/Montevideo',
      benefitId: consumed.benefitId,
      participationId: consumed.participationId,
    });

    await this.benefits.attachRedeemedVisit(consumed.participationId, visit.id);
    await this.events.emit({
      businessId,
      customerId: consumed.customerId,
      type: CustomerEventType.benefit_redeemed,
      visitId: visit.id,
      metadata: { benefitId: consumed.benefitId },
    });

    await this.closeRewardGoalIfRedeemed(consumed.participationId);

    return {
      ok: true as const,
      customerName: consumed.customerName,
      benefitTitle: consumed.benefitTitle,
      visitId: visit.id,
    };
  }

  /**
   * Fase F §0.2 — the other half of the Reward Goal lifecycle that Fase E
   * left open: when the `BenefitParticipation` just redeemed is the one a
   * `CustomerRewardGoal` carries, close that goal out too (UNLOCKED →
   * REDEEMED). A no-op for every other redemption — most benefits are never
   * reward-goal-sourced, and this must not change their behaviour at all.
   *
   * Idempotent the same way every other reward-goal transition is: a guarded
   * `updateMany` on `status: UNLOCKED`. `consumeRedemption`'s own atomic
   * guard already makes it impossible to reach this twice for the same
   * redemption, but the guard here costs nothing and keeps the invariant
   * self-evident without relying on that.
   */
  private async closeRewardGoalIfRedeemed(participationId: string) {
    const goal = await this.prisma.customerRewardGoal.findFirst({
      where: {
        benefitParticipationId: participationId,
        status: RewardGoalStatus.UNLOCKED,
      },
      select: { id: true, businessId: true, customerId: true },
    });
    if (!goal) return;

    const transitioned = await this.prisma.customerRewardGoal.updateMany({
      where: { id: goal.id, status: RewardGoalStatus.UNLOCKED },
      data: { status: RewardGoalStatus.REDEEMED, redeemedAt: new Date() },
    });
    if (transitioned.count === 0) return;

    await this.decisions.record({
      businessId: goal.businessId,
      customerId: goal.customerId,
      decisionCode: DECISION_CODES.REWARD_GOAL_REDEEMED,
      metadata: { goalId: goal.id, participationId },
    });
  }
}
