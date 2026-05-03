import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { CampaignsService } from './campaigns.service';
import { CampaignsRepository } from './campaigns.repository';
import { BranchesRepository } from '../branches/branches.repository';
import { PlansService } from '../plans/plans.service';
import { AuditService } from '../../common/services/audit.service';

const BUSINESS_ID = 'biz-1';
const CAMPAIGN_ID = 'cmp-1';
const BRANCH_ID = 'br-1';
const USER_ID = 'usr-1';

const DEFAULT_LIMITS = {
  maxBranches: 1,
  maxMembers: 2,
  maxCampaigns: 5,
  maxReviewsPerMonth: 100,
};

const mockCampaign = {
  id: CAMPAIGN_ID,
  businessId: BUSINESS_ID,
  branchId: null,
  name: 'QR Mostrador',
  slug: 'qr-mostrador',
  description: null,
  channel: 'QR_COUNTER',
  status: CampaignStatus.DRAFT,
  destinationType: 'GOOGLE_REVIEW',
  destinationUrl: 'https://g.page/test/review',
  enableLanding: false,
  startsAt: null,
  endsAt: null,
  createdByUserId: USER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  branch: null,
  _count: { qrCodes: 0, scanEvents: 0 },
};

const mockRepo = {
  findManyByBusiness: jest.fn(),
  findOne: jest.fn(),
  ensureRepeatTemplates: jest.fn(),
  createAtomic: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
};

const mockBranchesRepo = {
  findOne: jest.fn(),
};

const mockPlansService = {
  getLimits: jest.fn(),
};

const mockAuditService = {
  log: jest.fn(),
};

describe('CampaignsService', () => {
  let service: CampaignsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPlansService.getLimits.mockResolvedValue(DEFAULT_LIMITS);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: CampaignsRepository, useValue: mockRepo },
        { provide: BranchesRepository, useValue: mockBranchesRepo },
        { provide: PlansService, useValue: mockPlansService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  // ---------------------------------------------------------------------------
  // listForBusiness
  // ---------------------------------------------------------------------------
  describe('listForBusiness', () => {
    it('returns campaigns scoped to businessId', async () => {
      mockRepo.findManyByBusiness.mockResolvedValue([mockCampaign]);
      const result = await service.listForBusiness(
        BUSINESS_ID,
        undefined,
        USER_ID,
      );
      expect(result).toHaveLength(1);
      expect(mockRepo.findManyByBusiness).toHaveBeenCalledWith(
        BUSINESS_ID,
        undefined,
      );
    });

    it('passes status filter when provided', async () => {
      mockRepo.findManyByBusiness.mockResolvedValue([]);
      await service.listForBusiness(
        BUSINESS_ID,
        CampaignStatus.ACTIVE,
        USER_ID,
      );
      expect(mockRepo.findManyByBusiness).toHaveBeenCalledWith(
        BUSINESS_ID,
        CampaignStatus.ACTIVE,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findOneScoped
  // ---------------------------------------------------------------------------
  describe('findOneScoped', () => {
    it('returns campaign when it belongs to the business', async () => {
      mockRepo.findOne.mockResolvedValue(mockCampaign);
      const result = await service.findOneScoped(BUSINESS_ID, CAMPAIGN_ID);
      expect(result.id).toBe(CAMPAIGN_ID);
    });

    it('throws NotFoundException when campaign not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(
        service.findOneScoped(BUSINESS_ID, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    const createDto = {
      name: 'QR Mostrador',
      slug: 'qr-mostrador',
      channel: 'QR_COUNTER' as const,
      destinationType: 'GOOGLE_REVIEW' as const,
      destinationUrl: 'https://g.page/test/review',
    };

    it('creates campaign when under limit and slug available', async () => {
      mockRepo.createAtomic.mockResolvedValue(mockCampaign);
      const result = await service.create(BUSINESS_ID, createDto, USER_ID);
      expect(result.id).toBe(CAMPAIGN_ID);
      expect(mockPlansService.getLimits).toHaveBeenCalledWith(BUSINESS_ID);
      expect(mockRepo.createAtomic).toHaveBeenCalledWith(
        BUSINESS_ID,
        { ...createDto, createdByUserId: USER_ID },
        DEFAULT_LIMITS.maxCampaigns,
      );
    });

    it('throws ForbiddenException when campaign limit reached', async () => {
      mockRepo.createAtomic.mockResolvedValue('LIMIT_REACHED');
      await expect(
        service.create(BUSINESS_ID, createDto, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when slug taken', async () => {
      mockRepo.createAtomic.mockResolvedValue('SLUG_TAKEN');
      await expect(
        service.create(BUSINESS_ID, createDto, USER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('validates branchId belongs to business', async () => {
      mockBranchesRepo.findOne.mockResolvedValue(null);
      await expect(
        service.create(
          BUSINESS_ID,
          { ...createDto, branchId: 'wrong-branch' },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockBranchesRepo.findOne).toHaveBeenCalledWith(
        BUSINESS_ID,
        'wrong-branch',
      );
    });

    it('allows branchId when it belongs to business', async () => {
      mockBranchesRepo.findOne.mockResolvedValue({
        id: BRANCH_ID,
        businessId: BUSINESS_ID,
      });
      mockRepo.createAtomic.mockResolvedValue(mockCampaign);

      await service.create(
        BUSINESS_ID,
        { ...createDto, branchId: BRANCH_ID },
        USER_ID,
      );

      expect(mockBranchesRepo.findOne).toHaveBeenCalledWith(
        BUSINESS_ID,
        BRANCH_ID,
      );
      expect(mockRepo.createAtomic).toHaveBeenCalled();
    });

    it('throws BadRequestException when endsAt before startsAt', async () => {
      await expect(
        service.create(
          BUSINESS_ID,
          {
            ...createDto,
            startsAt: '2026-06-01T00:00:00Z',
            endsAt: '2026-05-01T00:00:00Z',
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when GOOGLE_REVIEW without destinationUrl', async () => {
      await expect(
        service.create(
          BUSINESS_ID,
          {
            name: 'Test',
            slug: 'test',
            channel: 'QR_COUNTER' as const,
            destinationType: 'GOOGLE_REVIEW' as const,
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows LANDING_ONLY without destinationUrl', async () => {
      mockRepo.createAtomic.mockResolvedValue(mockCampaign);
      await service.create(
        BUSINESS_ID,
        {
          name: 'Landing',
          slug: 'landing',
          channel: 'QR_COUNTER' as const,
          destinationType: 'LANDING_ONLY' as const,
        },
        USER_ID,
      );
      expect(mockRepo.createAtomic).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------
  describe('update', () => {
    it('throws NotFoundException when campaign not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update(BUSINESS_ID, 'missing', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates campaign when it exists', async () => {
      mockRepo.findOne.mockResolvedValue(mockCampaign);
      mockRepo.update.mockResolvedValue({
        ...mockCampaign,
        name: 'Nuevo Nombre',
      });
      const result = await service.update(BUSINESS_ID, CAMPAIGN_ID, {
        name: 'Nuevo Nombre',
      });
      expect(result.name).toBe('Nuevo Nombre');
    });

    it('throws BadRequestException when updating archived campaign', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ARCHIVED,
      });
      await expect(
        service.update(BUSINESS_ID, CAMPAIGN_ID, { name: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates branchId on update', async () => {
      mockRepo.findOne.mockResolvedValue(mockCampaign);
      mockBranchesRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update(BUSINESS_ID, CAMPAIGN_ID, {
          branchId: 'wrong-branch',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // updateStatus
  // ---------------------------------------------------------------------------
  describe('updateStatus', () => {
    it('allows valid transition DRAFT → ACTIVE', async () => {
      mockRepo.findOne.mockResolvedValue(mockCampaign);
      mockRepo.updateStatus.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ACTIVE,
      });
      const result = await service.updateStatus(BUSINESS_ID, CAMPAIGN_ID, {
        status: CampaignStatus.ACTIVE,
      });
      expect(result.status).toBe(CampaignStatus.ACTIVE);
    });

    it('rejects invalid transition DRAFT → PAUSED', async () => {
      mockRepo.findOne.mockResolvedValue(mockCampaign);
      await expect(
        service.updateStatus(BUSINESS_ID, CAMPAIGN_ID, {
          status: CampaignStatus.PAUSED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows ACTIVE → ARCHIVED', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ACTIVE,
      });
      mockRepo.updateStatus.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ARCHIVED,
        archivedAt: new Date(),
      });
      const result = await service.updateStatus(BUSINESS_ID, CAMPAIGN_ID, {
        status: CampaignStatus.ARCHIVED,
      });
      expect(result.status).toBe(CampaignStatus.ARCHIVED);
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        BUSINESS_ID,
        CAMPAIGN_ID,
        CampaignStatus.ARCHIVED,
      );
    });

    it('allows ARCHIVED → DRAFT (unarchive)', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ARCHIVED,
      });
      mockRepo.updateStatus.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.DRAFT,
        archivedAt: null,
      });
      const result = await service.updateStatus(BUSINESS_ID, CAMPAIGN_ID, {
        status: CampaignStatus.DRAFT,
      });
      expect(result.status).toBe(CampaignStatus.DRAFT);
    });

    it('rejects ARCHIVED → ACTIVE (must go through DRAFT)', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ARCHIVED,
      });
      await expect(
        service.updateStatus(BUSINESS_ID, CAMPAIGN_ID, {
          status: CampaignStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing campaign', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateStatus(BUSINESS_ID, 'missing', {
          status: CampaignStatus.ACTIVE,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
