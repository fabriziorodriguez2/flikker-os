import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ReviewStatus, ReviewSource } from '@prisma/client';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewsOverviewService } from './reviews-overview.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';

const noopGuard = { canActivate: () => true };

const BUSINESS_ID = 'biz-1';
const REVIEW_ID = 'rev-1';
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

const mockService = {
  listForBusiness: jest.fn(),
  findOneScoped: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  highlight: jest.fn(),
  unhighlight: jest.fn(),
  markResponded: jest.fn(),
  markUnresponded: jest.fn(),
  updateStatus: jest.fn(),
};

function fakeReq(
  overrides?: Partial<AuthenticatedRequest>,
): AuthenticatedRequest {
  return {
    currentBusinessId: BUSINESS_ID,
    user: {
      id: USER_ID,
      email: 'test@test.com',
      firstName: 'Test',
      lastName: 'User',
      isActive: true,
      isPlatformAdmin: false,
    },
    ...overrides,
  } as AuthenticatedRequest;
}

describe('ReviewsController', () => {
  let controller: ReviewsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [
        { provide: ReviewsService, useValue: mockService },
        // La fachada de la pantalla de Resenas. Este spec cubre los endpoints
        // viejos del controller, asi que alcanza con satisfacer la
        // dependencia; su comportamiento se prueba en su propio spec.
        {
          provide: ReviewsOverviewService,
          useValue: { forBusiness: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue(noopGuard)
      .overrideGuard(TenantGuard)
      .useValue(noopGuard)
      .overrideGuard(RolesGuard)
      .useValue(noopGuard)
      .compile();

    controller = module.get<ReviewsController>(ReviewsController);
  });

  describe('list', () => {
    it('delegates to service with MVP filters', async () => {
      const paginated = { data: [mockReview], total: 1, page: 1, limit: 25 };
      mockService.listForBusiness.mockResolvedValue(paginated);

      const query = {
        status: ReviewStatus.NEW,
        responded: false,
        isHighlighted: true,
        campaignId: 'cmp-1',
      };
      const result = await controller.list(fakeReq(), query);

      expect(result).toEqual(paginated);
      expect(mockService.listForBusiness).toHaveBeenCalledWith(
        BUSINESS_ID,
        query,
      );
    });
  });

  describe('findOne', () => {
    it('returns review detail', async () => {
      mockService.findOneScoped.mockResolvedValue(mockReview);

      const result = await controller.findOne(fakeReq(), REVIEW_ID);

      expect(result.id).toBe(REVIEW_ID);
      expect(mockService.findOneScoped).toHaveBeenCalledWith(
        BUSINESS_ID,
        REVIEW_ID,
      );
    });

    it('throws NotFoundException for missing review', async () => {
      mockService.findOneScoped.mockRejectedValue(
        new NotFoundException('Review not found'),
      );

      await expect(controller.findOne(fakeReq(), 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    const createDto = {
      source: ReviewSource.MANUAL,
      rating: 4,
      reviewedAt: '2026-03-28T15:00:00.000Z',
      content: 'Muy buena atencion',
      authorDisplayName: 'Carlos R.',
      campaignId: 'cmp-1',
    };

    it('creates review and passes userId', async () => {
      mockService.create.mockResolvedValue(mockReview);

      const result = await controller.create(fakeReq(), createDto);

      expect(result.id).toBe(REVIEW_ID);
      expect(mockService.create).toHaveBeenCalledWith(
        BUSINESS_ID,
        createDto,
        USER_ID,
      );
    });

    it('propagates ConflictException on duplicate', async () => {
      mockService.create.mockRejectedValue(new ConflictException('Duplicate'));

      await expect(controller.create(fakeReq(), createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('updates operational metadata', async () => {
      const updated = { ...mockReview, isHighlighted: true };
      mockService.update.mockResolvedValue(updated);

      const result = await controller.update(fakeReq(), REVIEW_ID, {
        isHighlighted: true,
      });

      expect(result.isHighlighted).toBe(true);
      expect(mockService.update).toHaveBeenCalledWith(BUSINESS_ID, REVIEW_ID, {
        isHighlighted: true,
      });
    });

    it('throws BadRequestException for archived review', async () => {
      mockService.update.mockRejectedValue(
        new BadRequestException('Cannot edit an archived review'),
      );

      await expect(
        controller.update(fakeReq(), REVIEW_ID, { isHighlighted: true }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('highlight actions', () => {
    it('highlights a review', async () => {
      mockService.highlight.mockResolvedValue({
        ...mockReview,
        isHighlighted: true,
      });

      const result = await controller.highlight(fakeReq(), REVIEW_ID);

      expect(result.isHighlighted).toBe(true);
      expect(mockService.highlight).toHaveBeenCalledWith(
        BUSINESS_ID,
        REVIEW_ID,
      );
    });

    it('unhighlights a review', async () => {
      mockService.unhighlight.mockResolvedValue(mockReview);

      await controller.unhighlight(fakeReq(), REVIEW_ID);

      expect(mockService.unhighlight).toHaveBeenCalledWith(
        BUSINESS_ID,
        REVIEW_ID,
      );
    });
  });

  describe('responded actions', () => {
    it('marks a review as responded', async () => {
      mockService.markResponded.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.RESPONDED,
      });

      const result = await controller.markResponded(fakeReq(), REVIEW_ID);

      expect(result.status).toBe(ReviewStatus.RESPONDED);
      expect(mockService.markResponded).toHaveBeenCalledWith(
        BUSINESS_ID,
        REVIEW_ID,
        USER_ID,
      );
    });

    it('marks a review as unresponded', async () => {
      mockService.markUnresponded.mockResolvedValue({
        ...mockReview,
        status: ReviewStatus.REVIEWED,
      });

      const result = await controller.markUnresponded(fakeReq(), REVIEW_ID);

      expect(result.status).toBe(ReviewStatus.REVIEWED);
      expect(mockService.markUnresponded).toHaveBeenCalledWith(
        BUSINESS_ID,
        REVIEW_ID,
        USER_ID,
      );
    });
  });

  describe('updateStatus', () => {
    it('transitions status and passes userId', async () => {
      const reviewed = { ...mockReview, status: ReviewStatus.REVIEWED };
      mockService.updateStatus.mockResolvedValue(reviewed);

      const result = await controller.updateStatus(fakeReq(), REVIEW_ID, {
        status: ReviewStatus.REVIEWED,
      });

      expect(result.status).toBe(ReviewStatus.REVIEWED);
      expect(mockService.updateStatus).toHaveBeenCalledWith(
        BUSINESS_ID,
        REVIEW_ID,
        { status: ReviewStatus.REVIEWED },
        USER_ID,
      );
    });
  });
});
