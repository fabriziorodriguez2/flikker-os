import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ReviewStatus, ReviewSource } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import { ReviewsRepository } from './reviews.repository';
import { CampaignsRepository } from '../campaigns/campaigns.repository';

const BUSINESS_ID = 'biz-1';
const REVIEW_ID = 'rev-1';
const CAMPAIGN_ID = 'cmp-1';
const USER_ID = 'usr-1';

const mockReview = {
  id: REVIEW_ID,
  businessId: BUSINESS_ID,
  branchId: null,
  campaignId: null,
  source: ReviewSource.GOOGLE,
  externalReviewId: 'ext-123',
  authorDisplayName: 'Maria P.',
  rating: 5,
  title: null,
  content: 'Excelente atencion',
  reviewedAt: new Date('2026-03-28'),
  ingestedAt: new Date(),
  status: ReviewStatus.NEW,
  language: null,
  isHighlighted: false,
  respondedAt: null,
  respondedByUserId: null,
  metadataJson: null,
  createdByUserId: USER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  campaign: null,
  respondedBy: null,
};

const mockRepo = {
  findOne: jest.fn(),
  findMany: jest.fn(),
  createAtomic: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
};

const mockCampaignsRepo = {
  findOne: jest.fn(),
};

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: ReviewsRepository, useValue: mockRepo },
        { provide: CampaignsRepository, useValue: mockCampaignsRepo },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  describe('findOneScoped', () => {
    it('returns review when it belongs to the business', async () => {
      mockRepo.findOne.mockResolvedValue(mockReview);
      const result = await service.findOneScoped(BUSINESS_ID, REVIEW_ID);
      expect(result.id).toBe(REVIEW_ID);
    });

    it('throws NotFoundException when review not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(
        service.findOneScoped(BUSINESS_ID, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = {
      source: ReviewSource.GOOGLE,
      rating: 5,
      reviewedAt: '2026-03-28T15:00:00.000Z',
      content: 'Excelente',
      authorDisplayName: 'Maria P.',
      externalReviewId: 'ext-123',
    };

    it('creates review when no duplicate exists', async () => {
      mockRepo.createAtomic.mockResolvedValue(mockReview);

      const result = await service.create(BUSINESS_ID, createDto, USER_ID);

      expect(result.id).toBe(REVIEW_ID);
      expect(mockRepo.createAtomic).toHaveBeenCalledWith(BUSINESS_ID, {
        ...createDto,
        createdByUserId: USER_ID,
      });
    });

    it('throws ConflictException when duplicate detected', async () => {
      mockRepo.createAtomic.mockResolvedValue('DUPLICATE');

      await expect(
        service.create(BUSINESS_ID, createDto, USER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('validates campaignId belongs to business', async () => {
      mockCampaignsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(
          BUSINESS_ID,
          { ...createDto, campaignId: 'wrong-campaign' },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows valid campaignId', async () => {
      mockCampaignsRepo.findOne.mockResolvedValue({ id: CAMPAIGN_ID });
      mockRepo.createAtomic.mockResolvedValue(mockReview);

      await service.create(
        BUSINESS_ID,
        { ...createDto, campaignId: CAMPAIGN_ID },
        USER_ID,
      );

      expect(mockCampaignsRepo.findOne).toHaveBeenCalledWith(
        BUSINESS_ID,
        CAMPAIGN_ID,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when review not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update(BUSINESS_ID, 'missing', { isHighlighted: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates operational metadata', async () => {
      mockRepo.findOne.mockResolvedValue(mockReview);
      mockRepo.update.mockResolvedValue({
        ...mockReview,
        isHighlighted: true,
      });

      const result = await service.update(BUSINESS_ID, REVIEW_ID, {
        isHighlighted: true,
      });

      expect(result.isHighlighted).toBe(true);
    });

    it('throws BadRequestException when updating archived review', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.ARCHIVED,
      });

      await expect(
        service.update(BUSINESS_ID, REVIEW_ID, { isHighlighted: true }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('allows valid transition NEW -> REVIEWED', async () => {
      mockRepo.findOne.mockResolvedValue(mockReview);
      mockRepo.updateStatus.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.REVIEWED,
      });

      const result = await service.updateStatus(
        BUSINESS_ID,
        REVIEW_ID,
        { status: ReviewStatus.REVIEWED },
        USER_ID,
      );

      expect(result.status).toBe(ReviewStatus.REVIEWED);
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        BUSINESS_ID,
        REVIEW_ID,
        ReviewStatus.REVIEWED,
        USER_ID,
        undefined,
      );
    });

    it('allows REVIEWED -> RESPONDED', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.REVIEWED,
      });
      mockRepo.updateStatus.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.RESPONDED,
      });

      const result = await service.updateStatus(
        BUSINESS_ID,
        REVIEW_ID,
        { status: ReviewStatus.RESPONDED },
        USER_ID,
      );

      expect(result.status).toBe(ReviewStatus.RESPONDED);
    });

    it('rejects invalid transition ARCHIVED -> REVIEWED', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.ARCHIVED,
      });

      await expect(
        service.updateStatus(
          BUSINESS_ID,
          REVIEW_ID,
          { status: ReviewStatus.REVIEWED },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('highlight actions', () => {
    it('highlights a review', async () => {
      mockRepo.findOne.mockResolvedValue(mockReview);
      mockRepo.update.mockResolvedValue({ ...mockReview, isHighlighted: true });

      const result = await service.highlight(BUSINESS_ID, REVIEW_ID);

      expect(result.isHighlighted).toBe(true);
      expect(mockRepo.update).toHaveBeenCalledWith(BUSINESS_ID, REVIEW_ID, {
        isHighlighted: true,
      });
    });

    it('does not highlight archived reviews', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.ARCHIVED,
      });

      await expect(service.highlight(BUSINESS_ID, REVIEW_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('responded actions', () => {
    it('marks review as responded', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.REVIEWED,
      });
      mockRepo.updateStatus.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.RESPONDED,
      });

      const result = await service.markResponded(
        BUSINESS_ID,
        REVIEW_ID,
        USER_ID,
      );

      expect(result.status).toBe(ReviewStatus.RESPONDED);
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        BUSINESS_ID,
        REVIEW_ID,
        ReviewStatus.RESPONDED,
        USER_ID,
      );
    });

    it('marks review as unresponded', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.RESPONDED,
      });
      mockRepo.updateStatus.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.REVIEWED,
        respondedAt: null,
        respondedByUserId: null,
      });

      const result = await service.markUnresponded(
        BUSINESS_ID,
        REVIEW_ID,
        USER_ID,
      );

      expect(result.status).toBe(ReviewStatus.REVIEWED);
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        BUSINESS_ID,
        REVIEW_ID,
        ReviewStatus.REVIEWED,
        USER_ID,
      );
    });
  });

  describe('listForBusiness', () => {
    it('delegates to repository with filters', async () => {
      const mockResult = { data: [mockReview], total: 1, page: 1, limit: 25 };
      mockRepo.findMany.mockResolvedValue(mockResult);

      const filters = {
        status: ReviewStatus.NEW,
        responded: false,
        isHighlighted: true,
      };
      const result = await service.listForBusiness(BUSINESS_ID, filters);

      expect(result.data).toHaveLength(1);
      expect(mockRepo.findMany).toHaveBeenCalledWith(BUSINESS_ID, filters);
    });
  });
});
