import { Test, TestingModule } from '@nestjs/testing';
import { PlansService } from './plans.service';
import { PlansRepository } from './plans.repository';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';

const BUSINESS_ID = 'biz-1';

const mockPlan = {
  id: 'plan-1',
  name: 'Starter',
  slug: 'starter',
  description: 'Starter plan',
  maxBranches: 3,
  maxMembers: 5,
  maxCampaigns: 5,
  maxReviewsPerMonth: 100,
  priceMonthly: 6900,
  priceUsd: 69,
  setupFeeUsd: 0,
  messageQuotaMonthly: 200,
  trialDays: 14,
  isActive: true,
  displayOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSubscription = {
  id: 'sub-1',
  status: SubscriptionStatus.ACTIVE,
  plan: {
    maxBranches: 3,
    maxMembers: 5,
    maxCampaigns: 5,
    maxReviewsPerMonth: 100,
    messageQuotaMonthly: 200,
  },
};

const mockRepo = {
  findAllActive: jest.fn(),
  findBySlug: jest.fn(),
  findActiveSubscription: jest.fn(),
  countActiveBranches: jest.fn(),
  countActiveMembers: jest.fn(),
  countParticipatingCustomers: jest.fn(),
  hasAnyRewardGoal: jest.fn(),
  createFreeSubscriptionIfMissing: jest.fn(),
  findBusinessTrialFields: jest.fn(),
  startBenefitsTrialIfNeeded: jest.fn(),
  ensureProSelfServicePlan: jest
    .fn()
    .mockResolvedValue({ currency: 'UYU', priceAmount: 1000 }),
};

describe('PlansService', () => {
  let service: PlansService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        { provide: PlansRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);
  });

  // ---------------------------------------------------------------------------
  // findAllActive
  // ---------------------------------------------------------------------------
  describe('findAllActive', () => {
    it('returns active plans from repository', async () => {
      mockRepo.findAllActive.mockResolvedValue([mockPlan]);
      const result = await service.findAllActive();
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('starter');
    });
  });

  // ---------------------------------------------------------------------------
  // findBySlug
  // ---------------------------------------------------------------------------
  describe('findBySlug', () => {
    it('returns plan when found', async () => {
      mockRepo.findBySlug.mockResolvedValue(mockPlan);
      const result = await service.findBySlug('starter');
      expect(result.name).toBe('Starter');
    });

    it('throws NotFoundException when plan does not exist', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);
      await expect(service.findBySlug('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getLimits
  // ---------------------------------------------------------------------------
  describe('getLimits', () => {
    it('returns plan limits when business has active subscription', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(mockSubscription);
      const limits = await service.getLimits(BUSINESS_ID);
      expect(limits.maxBranches).toBe(3);
      expect(limits.maxMembers).toBe(5);
      expect(limits.messageQuotaMonthly).toBe(200);
    });

    it('returns plan limits for TRIALING subscription', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.TRIALING,
      });
      const limits = await service.getLimits(BUSINESS_ID);
      expect(limits.maxBranches).toBe(3);
    });

    it('returns default limits when no subscription exists', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(null);
      const limits = await service.getLimits(BUSINESS_ID);
      expect(limits.maxBranches).toBe(1);
      expect(limits.maxMembers).toBe(2);
    });

    it('returns default limits when subscription is CANCELED', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.CANCELED,
      });
      const limits = await service.getLimits(BUSINESS_ID);
      expect(limits.maxBranches).toBe(1);
    });

    it('returns default limits when subscription is PAST_DUE', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.PAST_DUE,
      });
      const limits = await service.getLimits(BUSINESS_ID);
      expect(limits.maxBranches).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // assertCanAddBranch
  // ---------------------------------------------------------------------------
  describe('assertCanAddBranch', () => {
    it('passes when under limit', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(mockSubscription);
      mockRepo.countActiveBranches.mockResolvedValue(2);
      await expect(
        service.assertCanAddBranch(BUSINESS_ID),
      ).resolves.toBeUndefined();
    });

    it('throws ForbiddenException when at limit', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(mockSubscription);
      mockRepo.countActiveBranches.mockResolvedValue(3);
      await expect(service.assertCanAddBranch(BUSINESS_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when over limit', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(mockSubscription);
      mockRepo.countActiveBranches.mockResolvedValue(5);
      await expect(service.assertCanAddBranch(BUSINESS_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('uses default limits when no subscription', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(null);
      mockRepo.countActiveBranches.mockResolvedValue(1);
      await expect(service.assertCanAddBranch(BUSINESS_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('passes with default limits when under limit', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(null);
      mockRepo.countActiveBranches.mockResolvedValue(0);
      await expect(
        service.assertCanAddBranch(BUSINESS_ID),
      ).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // assertCanAddMember
  // ---------------------------------------------------------------------------
  describe('assertCanAddMember', () => {
    it('passes when under limit', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(mockSubscription);
      mockRepo.countActiveMembers.mockResolvedValue(3);
      await expect(
        service.assertCanAddMember(BUSINESS_ID),
      ).resolves.toBeUndefined();
    });

    it('throws ForbiddenException when at limit', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(mockSubscription);
      mockRepo.countActiveMembers.mockResolvedValue(5);
      await expect(service.assertCanAddMember(BUSINESS_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('uses default limits when no subscription', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(null);
      mockRepo.countActiveMembers.mockResolvedValue(2);
      await expect(service.assertCanAddMember(BUSINESS_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // canAddParticipant (self-service FREE — tope de 50 clientes participantes)
  // ---------------------------------------------------------------------------
  describe('canAddParticipant', () => {
    it('un cliente que ya participaba nunca se bloquea, sin importar el tope', async () => {
      mockRepo.hasAnyRewardGoal.mockResolvedValue(true);
      const result = await service.canAddParticipant(BUSINESS_ID, 'cust-1');
      expect(result).toBe(true);
      expect(mockRepo.findActiveSubscription).not.toHaveBeenCalled();
    });

    it('sin Subscription (LEGACY/Platform Admin) nunca hay tope', async () => {
      mockRepo.hasAnyRewardGoal.mockResolvedValue(false);
      mockRepo.findActiveSubscription.mockResolvedValue(null);
      const result = await service.canAddParticipant(BUSINESS_ID, 'cust-1');
      expect(result).toBe(true);
    });

    it('plan Pro (maxCustomers: null) nunca tiene tope', async () => {
      mockRepo.hasAnyRewardGoal.mockResolvedValue(false);
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'pro', maxCustomers: null },
      });
      const result = await service.canAddParticipant(BUSINESS_ID, 'cust-1');
      expect(result).toBe(true);
    });

    it('plan Free bajo el tope deja pasar un cliente nuevo', async () => {
      mockRepo.hasAnyRewardGoal.mockResolvedValue(false);
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'free', maxCustomers: 50 },
      });
      mockRepo.countParticipatingCustomers.mockResolvedValue(49);
      const result = await service.canAddParticipant(BUSINESS_ID, 'cust-1');
      expect(result).toBe(true);
    });

    it('plan Free en el tope bloquea un cliente nuevo', async () => {
      mockRepo.hasAnyRewardGoal.mockResolvedValue(false);
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'free', maxCustomers: 50 },
      });
      mockRepo.countParticipatingCustomers.mockResolvedValue(50);
      const result = await service.canAddParticipant(BUSINESS_ID, 'cust-1');
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // isOnProPlan / isBenefitsBlocked
  // ---------------------------------------------------------------------------
  describe('isOnProPlan', () => {
    it('true solo con plan pro + status ACTIVE', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'pro' },
      });
      expect(await service.isOnProPlan(BUSINESS_ID)).toBe(true);
    });

    it('false con plan pro pero TRIALING (Pro no tiene trial hoy)', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.TRIALING,
        plan: { slug: 'pro' },
      });
      expect(await service.isOnProPlan(BUSINESS_ID)).toBe(false);
    });

    it('false con plan free', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'free' },
      });
      expect(await service.isOnProPlan(BUSINESS_ID)).toBe(false);
    });

    it('false sin Subscription', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(null);
      expect(await service.isOnProPlan(BUSINESS_ID)).toBe(false);
    });

    it("true también con 'pro-selfservice' (Mercado Pago) — Pro es Pro sin importar la puerta", async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'pro-selfservice' },
      });
      expect(await service.isOnProPlan(BUSINESS_ID)).toBe(true);
    });
  });

  describe('isBenefitsBlocked', () => {
    it('Pro nunca está bloqueado, aunque el trial (viejo) haya vencido', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'pro' },
      });
      mockRepo.findBusinessTrialFields.mockResolvedValue({
        benefitsTrialStartedAt: new Date('2020-01-01'),
        benefitsTrialEndsAt: new Date('2020-02-01'),
      });
      expect(await service.isBenefitsBlocked(BUSINESS_ID)).toBe(false);
    });

    it("Pro self-service ('pro-selfservice', Mercado Pago) tampoco bloquea nunca", async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'pro-selfservice' },
      });
      mockRepo.findBusinessTrialFields.mockResolvedValue({
        benefitsTrialStartedAt: new Date('2020-01-01'),
        benefitsTrialEndsAt: new Date('2020-02-01'),
      });
      expect(await service.isBenefitsBlocked(BUSINESS_ID)).toBe(false);
    });

    it('Subscription PAST_DUE bloquea, sin importar el trial', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.PAST_DUE,
        plan: { slug: 'pro' },
      });
      expect(await service.isBenefitsBlocked(BUSINESS_ID)).toBe(true);
    });

    it('trial que nunca arrancó (LEGACY/solo sellos) nunca bloquea', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'free' },
      });
      mockRepo.findBusinessTrialFields.mockResolvedValue({
        benefitsTrialStartedAt: null,
        benefitsTrialEndsAt: null,
      });
      expect(await service.isBenefitsBlocked(BUSINESS_ID)).toBe(false);
    });

    it('trial corriendo (no vencido) no bloquea', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'free' },
      });
      mockRepo.findBusinessTrialFields.mockResolvedValue({
        benefitsTrialStartedAt: new Date(),
        benefitsTrialEndsAt: new Date(Date.now() + 10 * 86_400_000),
      });
      expect(await service.isBenefitsBlocked(BUSINESS_ID)).toBe(false);
    });

    it('trial vencido bloquea', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'free' },
      });
      mockRepo.findBusinessTrialFields.mockResolvedValue({
        benefitsTrialStartedAt: new Date('2020-01-01'),
        benefitsTrialEndsAt: new Date('2020-01-31'),
      });
      expect(await service.isBenefitsBlocked(BUSINESS_ID)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // assertBenefitsProActionAllowed — guard centralizado (create, reactivación, ...)
  // ---------------------------------------------------------------------------
  describe('assertBenefitsProActionAllowed', () => {
    it('no lanza cuando no está bloqueado', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'pro-selfservice' },
      });
      await expect(
        service.assertBenefitsProActionAllowed(BUSINESS_ID),
      ).resolves.toBeUndefined();
    });

    it('lanza ForbiddenException con mensaje claro cuando está bloqueado', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'free' },
      });
      mockRepo.findBusinessTrialFields.mockResolvedValue({
        benefitsTrialStartedAt: new Date('2020-01-01'),
        benefitsTrialEndsAt: new Date('2020-01-31'),
      });
      await expect(
        service.assertBenefitsProActionAllowed(BUSINESS_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ---------------------------------------------------------------------------
  // ensureFreeSubscriptionIfMissing / startBenefitsTrialIfNeeded — delegación
  // ---------------------------------------------------------------------------
  describe('ensureFreeSubscriptionIfMissing / startBenefitsTrialIfNeeded', () => {
    it('delega al repositorio con el businessId y un `now`', async () => {
      const now = new Date('2026-08-18T00:00:00.000Z');
      await service.ensureFreeSubscriptionIfMissing(BUSINESS_ID, now);
      expect(mockRepo.createFreeSubscriptionIfMissing).toHaveBeenCalledWith(
        BUSINESS_ID,
        now,
      );

      await service.startBenefitsTrialIfNeeded(BUSINESS_ID, now);
      expect(mockRepo.startBenefitsTrialIfNeeded).toHaveBeenCalledWith(
        BUSINESS_ID,
        now,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getSelfServiceStatus
  // ---------------------------------------------------------------------------
  describe('getSelfServiceStatus', () => {
    it('sin Subscription: sin tope, sin trial, no Pro', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue(null);
      mockRepo.findBusinessTrialFields.mockResolvedValue({
        benefitsTrialStartedAt: null,
        benefitsTrialEndsAt: null,
      });
      const result = await service.getSelfServiceStatus(BUSINESS_ID);
      expect(result).toEqual({
        maxCustomers: null,
        benefitsTrialExpired: false,
        trialEndsAt: null,
        isPro: false,
        planSlug: null,
        planName: null,
      });
    });

    it('Pro: sin tope de clientes aunque el plan tenga uno guardado', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: { slug: 'pro', name: 'Pro', maxCustomers: null },
      });
      mockRepo.findBusinessTrialFields.mockResolvedValue({
        benefitsTrialStartedAt: null,
        benefitsTrialEndsAt: null,
      });
      const result = await service.getSelfServiceStatus(BUSINESS_ID);
      expect(result.isPro).toBe(true);
      expect(result.maxCustomers).toBeNull();
      expect(result.benefitsTrialExpired).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getSubscriptionOverview (Configuración → Suscripción)
  // ---------------------------------------------------------------------------
  describe('getSubscriptionOverview', () => {
    it('plan Free con trial corriendo: calcula días restantes', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: {
          slug: 'free',
          name: 'Free — sellos y beneficios',
          maxCustomers: 50,
          currency: 'UYU',
          priceAmount: 0,
        },
      });
      mockRepo.findBusinessTrialFields.mockResolvedValue({
        benefitsTrialStartedAt: new Date(),
        benefitsTrialEndsAt: new Date(Date.now() + 10 * 86_400_000),
      });
      mockRepo.countParticipatingCustomers.mockResolvedValue(12);

      const result = await service.getSubscriptionOverview(BUSINESS_ID);

      expect(result.planSlug).toBe('free');
      expect(result.isPro).toBe(false);
      expect(result.maxCustomers).toBe(50);
      expect(result.participantsCount).toBe(12);
      expect(result.trialActive).toBe(true);
      expect(result.trialDaysRemaining).toBeGreaterThan(0);
      expect(result.benefitsBlocked).toBe(false);
      // Plan actual (Free, $0) es independiente del precio ANUNCIADO de upgrade.
      expect(result.currency).toBe('UYU');
      expect(result.priceAmount).toBe(0);
    });

    it('plan Pro histórico (USD, asignado a mano): sin tope, sin trial activo, precio propio en USD', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: {
          slug: 'pro',
          name: 'Pro',
          maxCustomers: null,
          currency: 'USD',
          priceAmount: 129,
        },
      });
      mockRepo.findBusinessTrialFields.mockResolvedValue({
        benefitsTrialStartedAt: new Date('2020-01-01'),
        benefitsTrialEndsAt: new Date('2020-02-01'),
      });
      mockRepo.countParticipatingCustomers.mockResolvedValue(80);

      const result = await service.getSubscriptionOverview(BUSINESS_ID);

      expect(result.isPro).toBe(true);
      expect(result.maxCustomers).toBeNull();
      expect(result.trialActive).toBe(false);
      expect(result.trialDaysRemaining).toBeNull();
      expect(result.benefitsBlocked).toBe(false);
      // Su PROPIO plan sigue en USD 129 — nunca se pisa con el precio self-service.
      expect(result.currency).toBe('USD');
      expect(result.priceAmount).toBe(129);
    });

    it('el precio ANUNCIADO de upgrade (selfServicePro) es siempre UYU 1.000, sin importar el plan actual', async () => {
      mockRepo.findActiveSubscription.mockResolvedValue({
        status: SubscriptionStatus.ACTIVE,
        plan: {
          slug: 'pro', // el histórico en USD — no debe filtrar a selfServicePro
          name: 'Pro',
          maxCustomers: null,
          currency: 'USD',
          priceAmount: 129,
        },
      });
      mockRepo.findBusinessTrialFields.mockResolvedValue({
        benefitsTrialStartedAt: null,
        benefitsTrialEndsAt: null,
      });
      mockRepo.countParticipatingCustomers.mockResolvedValue(0);
      mockRepo.ensureProSelfServicePlan.mockResolvedValue({
        currency: 'UYU',
        priceAmount: 1000,
      });

      const result = await service.getSubscriptionOverview(BUSINESS_ID);

      expect(result.selfServicePro).toEqual({
        currency: 'UYU',
        priceAmount: 1000,
      });
      // Y el plan self-service real (el que Mercado Pago activa) también
      // queda como UYU 1.000, no como el USD 129 del plan histórico.
      const proSelfService = await service.ensureProSelfServicePlan();
      expect(proSelfService).toEqual({ currency: 'UYU', priceAmount: 1000 });
    });
  });
});
