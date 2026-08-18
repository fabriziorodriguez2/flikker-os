import { Injectable } from '@nestjs/common';
import { MembershipStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
  }

  findBySlug(slug: string) {
    return this.prisma.plan.findUnique({ where: { slug } });
  }

  /**
   * Returns the active subscription with its plan for a business.
   * Returns null if the business has no subscription.
   */
  findActiveSubscription(businessId: string) {
    return this.prisma.subscription.findUnique({
      where: { businessId },
      select: {
        id: true,
        status: true,
        trialEndsAt: true,
        plan: {
          select: {
            slug: true,
            name: true,
            currency: true,
            priceAmount: true,
            maxBranches: true,
            maxMembers: true,
            maxCampaigns: true,
            maxReviewsPerMonth: true,
            messageQuotaMonthly: true,
            maxCustomers: true,
          },
        },
      },
    });
  }

  countActiveBranches(businessId: string) {
    return this.prisma.branch.count({
      where: { businessId, isActive: true },
    });
  }

  countActiveMembers(businessId: string) {
    return this.prisma.membership.count({
      where: { businessId, status: MembershipStatus.ACTIVE },
    });
  }

  /**
   * Clientes distintos que alguna vez tuvieron una tarjeta de sellos
   * (cualquier `RewardGoalStatus`) — mismo criterio que
   * `LoyaltyProgramService#getOverview` usa para `customersParticipating`.
   * No se importa ese service acá a propósito: `plans` no depende de
   * `reward-goals` (es al revés — `reward-goals` va a depender de `plans`
   * para el entitlement), así que la query se repite acá, no se comparte.
   */
  async countParticipatingCustomers(businessId: string): Promise<number> {
    const rows = await this.prisma.customerRewardGoal.groupBy({
      by: ['customerId'],
      where: { businessId },
    });
    return rows.length;
  }

  async hasAnyRewardGoal(
    businessId: string,
    customerId: string,
  ): Promise<boolean> {
    const row = await this.prisma.customerRewardGoal.findFirst({
      where: { businessId, customerId },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Self-service: el único plan Free — sellos y Beneficios son capacidades
   * independientes (`RetentionSettings.rewardGoalsEnabled`/`benefitsEnabled`),
   * así que un solo plan alcanza para cualquier combinación de las dos. El
   * tope de clientes (`maxCustomers`) solo importa cuando los sellos están
   * realmente prendidos — ver `canAddParticipant`.
   */
  async ensureFreePlan() {
    return this.prisma.plan.upsert({
      where: { slug: 'free' },
      update: {},
      create: {
        slug: 'free',
        name: 'Free — sellos y beneficios',
        description:
          'Hasta 50 clientes participantes, tarjeta de sellos y QR/check-in.',
        maxBranches: 1,
        maxMembers: 2,
        maxCampaigns: 1,
        maxReviewsPerMonth: 20,
        messageQuotaMonthly: 0,
        maxCustomers: 50,
        priceMonthly: 0,
        priceUsd: 0,
        setupFeeUsd: 0,
        trialDays: 0,
        displayOrder: 0,
        isActive: true,
      },
    });
  }

  /**
   * Da de alta la Subscription Free SOLO si el negocio no tiene ninguna
   * todavía — `update: {}` es un no-op deliberado: esto nunca debe pisar una
   * Subscription existente (por ejemplo un Pro ya confirmado). Se llama cada
   * vez que se prende una capacidad self-service por primera vez (sellos o
   * Beneficios), desde cualquiera de los dos caminos de onboarding o desde
   * los toggles de Programa → Configuración.
   */
  async createFreeSubscriptionIfMissing(businessId: string, now: Date) {
    const plan = await this.ensureFreePlan();
    return this.prisma.subscription.upsert({
      where: { businessId },
      update: {},
      create: {
        businessId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        // Free no tiene billing real ni ciclo que vencer — un valor lejano en
        // vez de inventar un ciclo mensual que no existe.
        currentPeriodEnd: new Date(now.getTime() + 100 * 365 * 86_400_000),
        trialEndsAt: null,
      },
    });
  }

  /**
   * Plan Pro self-service — el que la Suscripción/Mercado Pago activan.
   * Slug DISTINTO del 'pro' histórico (USD 129/mes, asignado a mano por
   * Platform Admin a negocios reales como Clínica Dental Ejemplo): pisar ese
   * plan globalmente le cambiaría el precio a Subscriptions que no tienen
   * nada que ver con este flujo. Mismos límites generosos (10 sucursales,
   * 15 miembros, sin tope de clientes) — la diferencia es solo moneda y
   * precio, y cómo se llega a él (self-service vs. asignación manual).
   */
  async ensureProSelfServicePlan() {
    return this.prisma.plan.upsert({
      where: { slug: 'pro-selfservice' },
      update: {},
      create: {
        slug: 'pro-selfservice',
        name: 'Pro',
        description:
          'UYU 1.000/mes — Beneficios sin límite de trial, clientes sin tope.',
        maxBranches: 10,
        maxMembers: 15,
        maxCampaigns: 20,
        maxReviewsPerMonth: 600,
        maxCustomers: null,
        messageQuotaMonthly: 600,
        currency: 'UYU',
        priceAmount: 1000,
        priceUsd: 0,
        priceMonthly: 0,
        setupFeeUsd: 0,
        trialDays: 0,
        displayOrder: 1,
        isActive: true,
      },
    });
  }

  findBusinessTrialFields(businessId: string) {
    return this.prisma.business.findUnique({
      where: { id: businessId },
      select: { benefitsTrialStartedAt: true, benefitsTrialEndsAt: true },
    });
  }

  /**
   * Arranca el trial de Beneficios (30 días) UNA sola vez en la vida del
   * negocio — el `where` con `benefitsTrialStartedAt: null` hace que la
   * escritura sea atómica: si dos requests llegan a la vez, como mucho una
   * actualiza filas (`count: 1`), la otra ve `count: 0` y no pisa nada.
   */
  async startBenefitsTrialIfNeeded(businessId: string, now: Date) {
    const endsAt = new Date(now.getTime() + 30 * 86_400_000);
    await this.prisma.business.updateMany({
      where: { id: businessId, benefitsTrialStartedAt: null },
      data: { benefitsTrialStartedAt: now, benefitsTrialEndsAt: endsAt },
    });
  }
}
