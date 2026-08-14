import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateRedemptionCode } from '../../common/utils/redemption-code.util';

/**
 * Turns an UNLOCKED CustomerRewardGoal into a redeemable reward — the
 * "IncentiveIssuer / adaptador equivalente" Fase E §11 asks for, not a
 * second redemption system. Redemption itself is still 100% the existing
 * `BenefitsRepository.consumeRedemption` / `RedemptionService` /
 * `RedemptionController` path; this only creates the `BenefitParticipation`
 * that flow already knows how to consume.
 *
 * Deliberately a SEPARATE adapter from `IncentiveIssuerService`, not a reuse
 * of it: that service gives each retention VARIANT one shared carrier
 * `Benefit` (`benefitId_customerId` is `@@unique`), which a customer only
 * ever reaches once per variant. A Reward Goal customer can legitimately earn
 * the SAME incentive definition again months later — reusing that carrier
 * would collide with the unique constraint and silently hand back the OLD
 * (already redeemed) participation instead of a new one. Each goal therefore
 * gets its OWN dedicated inert `Benefit`, guaranteeing a fresh
 * `BenefitParticipation` every time, with no risk of colliding with anything
 * Retention V2 or the QR flow already owns.
 */
@Injectable()
export class RewardGoalIssuerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent: a goal with `benefitParticipationId` already set returns that
   * participation instead of minting a second one. The caller
   * (`RewardGoalUnlockService`) only reaches this once per goal in practice —
   * the partial-unique-guarded status transition is what makes that true —
   * but this checks anyway, the same defence-in-depth `IncentiveIssuerService`
   * uses.
   */
  async issueForGoal(goalId: string, now: Date = new Date()) {
    const goal = await this.prisma.customerRewardGoal.findUnique({
      where: { id: goalId },
      select: {
        id: true,
        businessId: true,
        customerId: true,
        benefitParticipationId: true,
        incentiveDefinition: {
          select: {
            id: true,
            name: true,
            description: true,
            conditions: true,
            type: true,
            expiresInDays: true,
          },
        },
      },
    });
    if (!goal) return null;

    if (goal.benefitParticipationId) {
      const participation = await this.prisma.benefitParticipation.findUnique({
        where: { id: goal.benefitParticipationId },
        select: { id: true, redemptionCode: true, expiresAt: true },
      });
      return participation
        ? {
            participationId: participation.id,
            code: participation.redemptionCode!,
            expiresAt: participation.expiresAt,
          }
        : null;
    }

    const definition = goal.incentiveDefinition;
    const benefit = await this.prisma.benefit.create({
      data: {
        businessId: goal.businessId,
        type: definition.type,
        title: definition.name,
        description: definition.description,
        terms: definition.conditions,
        // Never active: never competes for the QR flow's single-active slot.
        active: false,
      },
      select: { id: true },
    });

    const expiresAt = new Date(
      now.getTime() + definition.expiresInDays * 86_400_000,
    );

    const participation = await this.prisma.benefitParticipation.create({
      data: {
        benefitId: benefit.id,
        businessId: goal.businessId,
        customerId: goal.customerId,
        redemptionCode: generateRedemptionCode(),
        expiresAt,
        // Este carrier es privado (nunca aparece en el catálogo del dueño,
        // `active: false`), así que en la práctica nunca se renombra — pero
        // el snapshot no cuesta nada y mantiene la garantía uniforme.
        benefitTitleSnapshot: definition.name,
      },
      select: { id: true, redemptionCode: true, expiresAt: true },
    });

    await this.prisma.customerRewardGoal.update({
      where: { id: goal.id },
      data: { benefitParticipationId: participation.id },
    });

    return {
      participationId: participation.id,
      code: participation.redemptionCode!,
      expiresAt: participation.expiresAt,
    };
  }
}
