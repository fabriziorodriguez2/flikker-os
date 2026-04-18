import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { QrCodesService } from './qr-codes.service';
import { QrCodesRepository } from './qr-codes.repository';
import { CampaignsRepository } from '../campaigns/campaigns.repository';
import { BranchesRepository } from '../branches/branches.repository';

const BUSINESS_ID = 'biz-1';
const CAMPAIGN_ID = 'cmp-1';
const QR_ID = 'qr-1';
const BRANCH_ID = 'br-1';

const mockCampaign = {
  id: CAMPAIGN_ID,
  businessId: BUSINESS_ID,
  branchId: BRANCH_ID,
  name: 'QR Mostrador',
  slug: 'qr-mostrador',
  status: CampaignStatus.ACTIVE,
  branch: { id: BRANCH_ID, name: 'Centro', slug: 'centro' },
  _count: { qrCodes: 0, scanEvents: 0 },
};

const mockQrCode = {
  id: QR_ID,
  businessId: BUSINESS_ID,
  campaignId: CAMPAIGN_ID,
  branchId: BRANCH_ID,
  slug: 'aBcDeFgH',
  label: 'Mesa 1',
  destinationUrl: null,
  isActive: true,
  scannedCount: 0,
  lastScannedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  branch: { id: BRANCH_ID, name: 'Centro', slug: 'centro' },
  campaign: {
    id: CAMPAIGN_ID,
    name: 'QR Mostrador',
    slug: 'qr-mostrador',
    status: 'ACTIVE',
  },
};

const mockQrRepo = {
  findManyByCampaign: jest.fn(),
  findOne: jest.fn(),
  createAtomic: jest.fn(),
  update: jest.fn(),
};

const mockCampaignsRepo = {
  findOne: jest.fn(),
};

const mockBranchesRepo = {
  findOne: jest.fn(),
};

describe('QrCodesService', () => {
  let service: QrCodesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrCodesService,
        { provide: QrCodesRepository, useValue: mockQrRepo },
        { provide: CampaignsRepository, useValue: mockCampaignsRepo },
        { provide: BranchesRepository, useValue: mockBranchesRepo },
      ],
    }).compile();

    service = module.get<QrCodesService>(QrCodesService);
  });

  // ---------------------------------------------------------------------------
  // listForCampaign
  // ---------------------------------------------------------------------------
  describe('listForCampaign', () => {
    it('returns QR codes scoped to campaign and business', async () => {
      mockCampaignsRepo.findOne.mockResolvedValue(mockCampaign);
      mockQrRepo.findManyByCampaign.mockResolvedValue([mockQrCode]);

      const result = await service.listForCampaign(BUSINESS_ID, CAMPAIGN_ID);
      expect(result).toHaveLength(1);
      expect(mockCampaignsRepo.findOne).toHaveBeenCalledWith(
        BUSINESS_ID,
        CAMPAIGN_ID,
      );
      expect(mockQrRepo.findManyByCampaign).toHaveBeenCalledWith(
        BUSINESS_ID,
        CAMPAIGN_ID,
      );
    });

    it('throws NotFoundException when campaign not found', async () => {
      mockCampaignsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.listForCampaign(BUSINESS_ID, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // findOneScoped
  // ---------------------------------------------------------------------------
  describe('findOneScoped', () => {
    it('returns QR code when it belongs to business', async () => {
      mockQrRepo.findOne.mockResolvedValue(mockQrCode);
      const result = await service.findOneScoped(BUSINESS_ID, QR_ID);
      expect(result.id).toBe(QR_ID);
    });

    it('throws NotFoundException when QR not found', async () => {
      mockQrRepo.findOne.mockResolvedValue(null);
      await expect(
        service.findOneScoped(BUSINESS_ID, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    it('creates QR code with generated slug', async () => {
      mockCampaignsRepo.findOne.mockResolvedValue(mockCampaign);
      mockQrRepo.createAtomic.mockResolvedValue(mockQrCode);

      const result = await service.create(BUSINESS_ID, {
        campaignId: CAMPAIGN_ID,
        label: 'Mesa 1',
      });

      expect(result.id).toBe(QR_ID);
      expect(mockQrRepo.createAtomic).toHaveBeenCalledWith(
        BUSINESS_ID,
        expect.objectContaining({
          campaignId: CAMPAIGN_ID,
          slug: expect.any(String),
          branchId: BRANCH_ID, // inherited from campaign
          label: 'Mesa 1',
        }),
      );
    });

    it('throws BadRequestException when campaign not found', async () => {
      mockCampaignsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.create(BUSINESS_ID, { campaignId: 'missing' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when campaign is archived', async () => {
      mockCampaignsRepo.findOne.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ARCHIVED,
      });
      await expect(
        service.create(BUSINESS_ID, { campaignId: CAMPAIGN_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when branch does not belong to business', async () => {
      mockCampaignsRepo.findOne.mockResolvedValue(mockCampaign);
      mockBranchesRepo.findOne.mockResolvedValue(null);
      await expect(
        service.create(BUSINESS_ID, {
          campaignId: CAMPAIGN_ID,
          branchId: 'wrong-branch',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('inherits branchId from campaign when not specified', async () => {
      mockCampaignsRepo.findOne.mockResolvedValue(mockCampaign);
      mockQrRepo.createAtomic.mockResolvedValue(mockQrCode);

      await service.create(BUSINESS_ID, { campaignId: CAMPAIGN_ID });

      expect(mockQrRepo.createAtomic).toHaveBeenCalledWith(
        BUSINESS_ID,
        expect.objectContaining({ branchId: BRANCH_ID }),
      );
    });

    it('uses explicit branchId over campaign branchId', async () => {
      const otherBranch = 'br-other';
      mockCampaignsRepo.findOne.mockResolvedValue(mockCampaign);
      mockBranchesRepo.findOne.mockResolvedValue({
        id: otherBranch,
        businessId: BUSINESS_ID,
      });
      mockQrRepo.createAtomic.mockResolvedValue(mockQrCode);

      await service.create(BUSINESS_ID, {
        campaignId: CAMPAIGN_ID,
        branchId: otherBranch,
      });

      expect(mockQrRepo.createAtomic).toHaveBeenCalledWith(
        BUSINESS_ID,
        expect.objectContaining({ branchId: otherBranch }),
      );
    });

    it('retries slug generation on collision', async () => {
      mockCampaignsRepo.findOne.mockResolvedValue(mockCampaign);
      mockQrRepo.createAtomic
        .mockResolvedValueOnce('SLUG_TAKEN')
        .mockResolvedValueOnce(mockQrCode);

      const result = await service.create(BUSINESS_ID, {
        campaignId: CAMPAIGN_ID,
      });

      expect(result.id).toBe(QR_ID);
      expect(mockQrRepo.createAtomic).toHaveBeenCalledTimes(2);
    });

    it('throws after max slug retries exhausted', async () => {
      mockCampaignsRepo.findOne.mockResolvedValue(mockCampaign);
      mockQrRepo.createAtomic.mockResolvedValue('SLUG_TAKEN');

      await expect(
        service.create(BUSINESS_ID, { campaignId: CAMPAIGN_ID }),
      ).rejects.toThrow('Failed to generate unique QR slug after retries');

      expect(mockQrRepo.createAtomic).toHaveBeenCalledTimes(3);
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------
  describe('update', () => {
    it('updates QR code when it exists', async () => {
      mockQrRepo.findOne.mockResolvedValue(mockQrCode);
      mockQrRepo.update.mockResolvedValue({ ...mockQrCode, label: 'Mesa 2' });

      const result = await service.update(BUSINESS_ID, QR_ID, {
        label: 'Mesa 2',
      });
      expect(result.label).toBe('Mesa 2');
    });

    it('throws NotFoundException when QR not found', async () => {
      mockQrRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update(BUSINESS_ID, 'missing', { label: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('can deactivate a QR code', async () => {
      mockQrRepo.findOne.mockResolvedValue(mockQrCode);
      mockQrRepo.update.mockResolvedValue({ ...mockQrCode, isActive: false });

      const result = await service.update(BUSINESS_ID, QR_ID, {
        isActive: false,
      });
      expect(result.isActive).toBe(false);
      expect(mockQrRepo.update).toHaveBeenCalledWith(BUSINESS_ID, QR_ID, {
        isActive: false,
      });
    });

    it('can reactivate a QR code', async () => {
      mockQrRepo.findOne.mockResolvedValue({ ...mockQrCode, isActive: false });
      mockQrRepo.update.mockResolvedValue({ ...mockQrCode, isActive: true });

      const result = await service.update(BUSINESS_ID, QR_ID, {
        isActive: true,
      });
      expect(result.isActive).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // generateSlug
  // ---------------------------------------------------------------------------
  describe('generateSlug', () => {
    it('returns 8-character base64url string', () => {
      const slug = QrCodesService.generateSlug();
      expect(slug).toHaveLength(8);
      expect(slug).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generates unique slugs', () => {
      const slugs = new Set(
        Array.from({ length: 100 }, () => QrCodesService.generateSlug()),
      );
      expect(slugs.size).toBe(100);
    });
  });
});
