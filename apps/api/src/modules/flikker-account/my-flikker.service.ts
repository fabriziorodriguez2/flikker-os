import { Injectable, NotFoundException } from '@nestjs/common';
import { RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RewardGoalOrchestratorService } from '../reward-goals/reward-goal-orchestrator.service';
import {
  MissionProgressService,
  type CustomerMissionView,
} from '../missions/mission-progress.service';
import { BenefitsService } from '../benefits/benefits.service';

export interface MyFlikkerPlace {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  /** Color de la experiencia pública (Programa → Página de inscripción). */
  checkinBackgroundColor: string | null;
  loyaltyCardColor: string | null;
  loyaltyCardTextColor: string | null;
  loyaltyCardBackgroundImage: string | null;
  loyaltyStampAreaColor: string | null;
  loyaltyStampColor: string | null;
  loyaltyStampIcon: string | null;
  loyaltyShowBusinessName: boolean;
  loyaltyStampBackgroundPattern: string | null;
  loyaltyStampBackgroundOpacity: number | null;
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
  /**
   * Misiones vivas o recién completadas de ESTE negocio. Array vacío cuando el
   * negocio no ofrece ninguna — la pantalla no muestra una tarjeta decorativa
   * con un progreso inventado.
   */
  missions: CustomerMissionView[];
}

/** Una tarjeta de la sección Desafíos, ya resuelta a lo que se muestra. */
export interface MyFlikkerChallenge extends CustomerMissionView {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
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
    private readonly missions: MissionProgressService,
    private readonly benefits: BenefitsService,
  ) {}

  /**
   * "Desafíos" — todo lo que este cliente tiene activo para volver, de TODOS
   * sus negocios, en una sola lista.
   *
   * Es el read-model convergente: hoy solo trae misiones; cuando existan
   * rachas y desafíos de regreso se suman acá y la pantalla no cambia de
   * forma. Nunca devuelve tarjetas vacías: si no hay nada, la lista es vacía
   * y la pantalla lo dice con sus palabras.
   *
   * Orden: primero lo que está por vencer, después el resto. Lo ya completado
   * va al final — es un premio para retirar, no una tarea pendiente.
   */
  async listChallenges(
    flikkerAccountId: string,
    now: Date = new Date(),
  ): Promise<MyFlikkerChallenge[]> {
    const customers = await this.prisma.customer.findMany({
      where: { flikkerAccountId, isActive: true },
      select: {
        id: true,
        businessId: true,
        business: { select: { name: true, logoUrl: true } },
      },
    });

    const perBusiness = await Promise.all(
      customers.map(async (customer) => {
        const missions = await this.missions.currentView(
          customer.businessId,
          customer.id,
          now,
        );
        return missions.map((mission) => ({
          ...mission,
          businessId: customer.businessId,
          businessName: customer.business.name,
          logoUrl: customer.business.logoUrl,
        }));
      }),
    );

    return perBusiness.flat().sort((a, b) => {
      const aDone = a.status === 'COMPLETED';
      const bDone = b.status === 'COMPLETED';
      if (aDone !== bDone) return aDone ? 1 : -1;
      return Date.parse(a.endsAt) - Date.parse(b.endsAt);
    });
  }

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
            // Mismo color que el recorrido de check-in: Mi Flikker es su
            // continuación, no una pantalla aparte de Flikker.
            checkinBackgroundColor: true,
            loyaltyCardColor: true,
            loyaltyCardTextColor: true,
            loyaltyCardBackgroundImage: true,
            loyaltyStampAreaColor: true,
            loyaltyStampColor: true,
            loyaltyStampIcon: true,
            welcomeBenefitId: true,
            loyaltyShowBusinessName: true,
            loyaltyStampBackgroundPattern: true,
            loyaltyStampBackgroundOpacity: true,
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
            // Mismo color que el recorrido de check-in: Mi Flikker es su
            // continuación, no una pantalla aparte de Flikker.
            checkinBackgroundColor: true,
            loyaltyCardColor: true,
            loyaltyCardTextColor: true,
            loyaltyCardBackgroundImage: true,
            loyaltyStampAreaColor: true,
            loyaltyStampColor: true,
            loyaltyStampIcon: true,
            welcomeBenefitId: true,
            loyaltyShowBusinessName: true,
            loyaltyStampBackgroundPattern: true,
            loyaltyStampBackgroundOpacity: true,
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
      checkinBackgroundColor: string | null;
      loyaltyCardColor: string | null;
      loyaltyCardTextColor: string | null;
      loyaltyCardBackgroundImage: string | null;
      loyaltyStampAreaColor: string | null;
      loyaltyStampColor: string | null;
      loyaltyStampIcon: string | null;
      welcomeBenefitId: string | null;
      loyaltyShowBusinessName: boolean;
      loyaltyStampBackgroundPattern: string | null;
      loyaltyStampBackgroundOpacity: number | null;
    },
  ): Promise<MyFlikkerPlace> {
    const [visitsTotal, lastVisit, rewardView, unclaimedBenefit, missions] =
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
        // Lectura pura: abrir Mi Flikker nunca completa una misión ni emite
        // un premio — eso solo lo hace una visita real.
        this.missions.currentView(businessId, customerId),
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
      checkinBackgroundColor: business.checkinBackgroundColor,
      loyaltyCardColor: business.loyaltyCardColor,
      loyaltyCardTextColor: business.loyaltyCardTextColor,
      loyaltyCardBackgroundImage: business.loyaltyCardBackgroundImage,
      loyaltyStampAreaColor: business.loyaltyStampAreaColor,
      loyaltyStampColor: business.loyaltyStampColor,
      loyaltyStampIcon: business.loyaltyStampIcon,
      loyaltyShowBusinessName: business.loyaltyShowBusinessName,
      loyaltyStampBackgroundPattern: business.loyaltyStampBackgroundPattern,
      loyaltyStampBackgroundOpacity: business.loyaltyStampBackgroundOpacity,
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
      missions,
    };
  }
}
