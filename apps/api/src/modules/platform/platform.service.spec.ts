import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PlatformService } from './platform.service';
import { PlatformRepository } from './platform.repository';
import { AuditService } from '../../common/services/audit.service';
import { CustomersService } from '../customers/customers.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleReviewDetectionQueue } from '../../jobs/google-review-detection.queue';

const mockRepo = {
  findAllBusinesses: jest.fn(),
  findBusinessById: jest.fn(),
  createImpersonationLog: jest.fn(),
  findAuditLogs: jest.fn(),
  updateGoogleBusinessProfile: jest.fn(),
};

const mockJwt = {
  sign: jest.fn(),
};

const mockAuditService = {
  log: jest.fn(),
};

const mockCustomersService = {};
const mockCampaignsService = {};
const mockWhatsAppBspService = {};
const mockGoogleReviewDetectionQueue = {
  enqueueInitialScrape: jest.fn(),
};
// Only the experience-version flows reach Prisma directly; the cases in this
// suite do not, so an empty stub is enough to satisfy the constructor.
const mockPrisma = {};

describe('PlatformService', () => {
  let service: PlatformService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformService,
        { provide: PlatformRepository, useValue: mockRepo },
        { provide: JwtService, useValue: mockJwt },
        { provide: AuditService, useValue: mockAuditService },
        { provide: CustomersService, useValue: mockCustomersService },
        { provide: CampaignsService, useValue: mockCampaignsService },
        { provide: WhatsAppBspService, useValue: mockWhatsAppBspService },
        {
          provide: GoogleReviewDetectionQueue,
          useValue: mockGoogleReviewDetectionQueue,
        },
        { provide: PrismaService, useValue: mockPrisma },
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

  describe('impersonate', () => {
    it('logs impersonation and returns a short-lived token', async () => {
      mockRepo.findBusinessById.mockResolvedValue({
        id: 'biz-1',
        name: 'Gains',
        slug: 'gains',
      });
      mockRepo.createImpersonationLog.mockResolvedValue({ id: 'log-1' });
      mockJwt.sign.mockReturnValue('impersonation-token');

      const result = await service.impersonate('admin-1', 'biz-1');

      expect(mockRepo.createImpersonationLog).toHaveBeenCalledWith(
        'admin-1',
        'biz-1',
      );
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          sub: 'admin-1',
          businessId: 'biz-1',
          isImpersonating: true,
        },
        expect.objectContaining({ expiresIn: '1h' }),
      );
      expect(result.accessToken).toBe('impersonation-token');
      expect(result.business.name).toBe('Gains');
    });
  });

  describe('connectGoogleBusinessProfile', () => {
    it('saves the Place ID and enqueues the initial review scrape', async () => {
      mockRepo.findBusinessById.mockResolvedValue({
        id: 'biz-1',
        name: 'Gains',
        slug: 'gains',
      });
      mockRepo.updateGoogleBusinessProfile.mockResolvedValue({
        id: 'biz-1',
        googlePlaceId: 'place-1',
        googleReviewsLastSyncAt: null,
        googleBusinessProfileUrl:
          'https://search.google.com/local/writereview?placeid=place-1',
        defaultReviewRedirectUrl:
          'https://search.google.com/local/writereview?placeid=place-1',
      });
      mockGoogleReviewDetectionQueue.enqueueInitialScrape.mockResolvedValue({
        id: 'job-1',
      });

      const result = await service.connectGoogleBusinessProfile(
        'admin-1',
        'biz-1',
        { googlePlaceId: 'place-1' },
      );

      expect(mockRepo.updateGoogleBusinessProfile).toHaveBeenCalledWith(
        'biz-1',
        {
          googlePlaceId: 'place-1',
          googleBusinessProfileUrl:
            'https://search.google.com/local/writereview?placeid=place-1',
          defaultReviewRedirectUrl:
            'https://search.google.com/local/writereview?placeid=place-1',
        },
      );
      expect(
        mockGoogleReviewDetectionQueue.enqueueInitialScrape,
      ).toHaveBeenCalledWith('biz-1');
      expect(result.googleReviewsLastSyncAt).toBeNull();
    });
  });
});
