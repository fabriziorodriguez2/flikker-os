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
  priceMonthly: 2900,
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
  },
};

const mockRepo = {
  findAllActive: jest.fn(),
  findBySlug: jest.fn(),
  findActiveSubscription: jest.fn(),
  countActiveBranches: jest.fn(),
  countActiveMembers: jest.fn(),
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
});
