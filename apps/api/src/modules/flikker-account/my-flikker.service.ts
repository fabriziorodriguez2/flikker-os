import { Injectable, NotFoundException } from '@nestjs/common';
import { RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RewardGoalOrchestratorService } from '../reward-goals/reward-goal-orchestrator.service';
import { BenefitsService } from '../benefits/benefits.service';

export interface MyFlikkerPlace {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  loyaltyCardColor: string | null;
  loyaltyCardTextColor: string | null;
  loyaltyCardBackgroundImage: string | null;
  loyaltyStampAreaColor: string | null;
  loyaltyStampColor: string | null;
  loyaltyStampIcon: string | null;
  loyaltyShowBusinessName: boolean;
  visitsTotal: number;
  lastVisitAt: string | null;
  rewardGoal: {
    incentiveName: string;
    progressVisits: number;
    visitProgress: number;
    bonusStamps: number;
    targetAdditionalVisits: number;
    remainingVisits: number;
  } | null;
  benefitAvailable: {
    name: string;
    code: string;
    expiresAt: string | null;
  } | null;
  /**
   * Otros beneficios otorgados a este cliente y sin canjear — típicamente
   * por una promoción manual (Notificaciones → Promociones ya puede elegir
   * cualquier Benefit del catálogo, no solo el `active` del check-in).
   * Independiente de `benefitAvailable` (que solo cubre la recompensa de
   * una tarjeta ya desbloqueada) para no duplicar esa fila.
   */
  otherBenefits: {
    title: string;
    description: string | null;
    terms: string | null;
    code: string;
    expiresAt: string | null;
  }[];
}

/**
 * "Mi Flikker" — the customer's OWN cross-business view (Fase E §18-20). The
 * only surface in the whole product allowed to read `Customer` rows across
 * more than one business for the same request; every field returned is
 * customer-facing (visits, progress, benefit) — segment, assignment,
 * experiment and uplift never leave the business dashboard (Fase E §20).
 */
@Injectable()
export class MyFlikkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rewardGoals: RewardGoalOrchestratorService,
    private readonly benefits: BenefitsService,
  ) { }

  /**
   * Every business where this account has a real, tenant-scoped Customer —
   * a Customer row only ever exists after an actual registration/visit, so
   * no extra "has interacted" filter is needed on top of it (Fase E §19).
   */
  async listPlaces(flikkerAccountId: string): Promise<MyFlikkerPlace[]> {
    const customers = await this.prisma.customer.findMany({
      where: { flikkerAccountId, isActive: true },
      select: {
        id: true,
        businessId: true,
        business: {
          select: {
            name: true,
            logoUrl: true,
            primaryColor: true,
            loyaltyCardColor: true,
            loyaltyCardTextColor: true,
            loyaltyCardBackgroundImage: true,
            loyaltyStampAreaColor: true,
            loyaltyStampColor: true,
            loyaltyStampIcon: true,
            welcomeBenefitId: true,
            loyaltyShowBusinessName: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return Promise.all(
      customers.map((customer) =>
        this.placeSummary(customer.id, customer.businessId, customer.business),
      ),
    );
  }

  /** The detail view for one business (Fase E §20). */
  async placeDetail(
    flikkerAccountId: string,
    businessId: string,
  ): Promise<MyFlikkerPlace> {
    const customer = await this.prisma.customer.findFirst({
      where: { flikkerAccountId, businessId, isActive: true },
      select: {
        id: true,
        businessId: true,
        business: {
          select: {
            name: true,
            logoUrl: true,
            primaryColor: true,
            loyaltyCardColor: true,
            loyaltyCardTextColor: true,
            loyaltyCardBackgroundImage: true,
            loyaltyStampAreaColor: true,
            loyaltyStampColor: true,
            loyaltyStampIcon: true,
            welcomeBenefitId: true,
            loyaltyShowBusinessName: true,
          },
        },
      },
    });
    if (!customer) {
      // Same shape as "unknown business" — never confirm or deny whether an
      // account has a relationship with a business it isn't authorized to see.
      throw new NotFoundException('Business not found');
    }
    return this.placeSummary(
      customer.id,
      customer.businessId,
      customer.business,
    );
  }

  private async placeSummary(
    customerId: string,
    businessId: string,
    business: {
      name: string;
      logoUrl: string | null;
      primaryColor: string | null;
      loyaltyCardColor: string | null;
      loyaltyCardTextColor: string | null;
      loyaltyCardBackgroundImage: string | null;
      loyaltyStampAreaColor: string | null;
      loyaltyStampColor: string | null;
      loyaltyStampIcon: string | null;
      welcomeBenefitId: string | null;
      loyaltyShowBusinessName: boolean;
    },
  ): Promise<MyFlikkerPlace> {
    const [visitsTotal, lastVisit, rewardView, unclaimedBenefit] =
      await Promise.all([
        this.prisma.visit.count({ where: { businessId, customerId } }),
        this.prisma.visit.findFirst({
          where: { businessId, customerId },
          orderBy: { occurredAt: 'desc' },
          select: { occurredAt: true },
        }),
        this.rewardGoals.currentView(businessId, customerId),
        this.prisma.customerRewardGoal.findFirst({
          where: { businessId, customerId, status: RewardGoalStatus.UNLOCKED },
          select: {
            incentiveDefinition: { select: { name: true } },
            benefitParticipation: {
              select: {
                benefitId: true,
                redemptionCode: true,
                expiresAt: true,
              },
            },
          },
        }),
      ]);

    const benefitAvailable = unclaimedBenefit?.benefitParticipation
      ?.redemptionCode
      ? {
        name: unclaimedBenefit.incentiveDefinition.name,
        code: unclaimedBenefit.benefitParticipation.redemptionCode,
        expiresAt:
          unclaimedBenefit.benefitParticipation.expiresAt?.toISOString() ??
          null,
      }
      : null;

    // Cualquier otro beneficio otorgado (típicamente por promoción manual),
    // sin contar el de la recompensa de tarjeta ya cubierta arriba ni el
    // regalo de bienvenida.
    const otherBenefits = await this.benefits.getOtherAvailableBenefits(
      businessId,
      customerId,
      [
        unclaimedBenefit?.benefitParticipation?.benefitId,
        business.welcomeBenefitId,
      ],
    );

    return {
      businessId,
      businessName: business.name,
      logoUrl: business.logoUrl,
      primaryColor: business.primaryColor,
      loyaltyCardColor: business.loyaltyCardColor,
      loyaltyCardTextColor: business.loyaltyCardTextColor,
      loyaltyCardBackgroundImage: business.loyaltyCardBackgroundImage,
      loyaltyStampAreaColor: business.loyaltyStampAreaColor,
      loyaltyStampColor: business.loyaltyStampColor,
      loyaltyStampIcon: business.loyaltyStampIcon,
      loyaltyShowBusinessName: business.loyaltyShowBusinessName,
      visitsTotal,
      lastVisitAt: lastVisit?.occurredAt.toISOString() ?? null,
      rewardGoal: rewardView.goal,
      benefitAvailable,
      otherBenefits: otherBenefits.map((b) => ({
        title: b.title,
        description: b.description,
        terms: b.terms,
        code: b.code,
        expiresAt: b.expiresAt?.toISOString() ?? null,
      })),
    };
  }
}
