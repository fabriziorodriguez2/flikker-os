import { Test, TestingModule } from '@nestjs/testing';
import { PlatformService } from './platform.service';
import { PlatformRepository } from './platform.repository';

const mockRepo = {
  findAllBusinesses: jest.fn(),
};

describe('PlatformService', () => {
  let service: PlatformService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformService,
        { provide: PlatformRepository, useValue: mockRepo },
      ],
    }).compile();
    service = module.get<PlatformService>(PlatformService);
  });

  describe('listBusinesses', () => {
    it('maps businesses with subscription info', async () => {
      mockRepo.findAllBusinesses.mockResolvedValue([
        {
          id: 'b1',
          name: 'Gains',
          slug: 'gains',
          status: 'ACTIVE',
          industry: 'Fitness',
          country: 'UY',
          createdAt: new Date('2026-01-01'),
          subscription: {
            status: 'ACTIVE',
            plan: { name: 'Pro', slug: 'pro' },
          },
          _count: { branches: 3, memberships: 5 },
        },
      ]);

      const result = await service.listBusinesses();
      expect(result).toHaveLength(1);
      expect(result[0].plan).toBe('Pro');
      expect(result[0].branchCount).toBe(3);
      expect(result[0].memberCount).toBe(5);
    });

    it('defaults to Free when no subscription', async () => {
      mockRepo.findAllBusinesses.mockResolvedValue([
        {
          id: 'b2',
          name: 'Café',
          slug: 'cafe',
          status: 'ACTIVE',
          industry: null,
          country: 'UY',
          createdAt: new Date(),
          subscription: null,
          _count: { branches: 1, memberships: 2 },
        },
      ]);

      const result = await service.listBusinesses();
      expect(result[0].plan).toBe('Free');
      expect(result[0].subscriptionStatus).toBeNull();
    });

    it('returns empty array when no businesses', async () => {
      mockRepo.findAllBusinesses.mockResolvedValue([]);
      const result = await service.listBusinesses();
      expect(result).toEqual([]);
    });
  });
});
