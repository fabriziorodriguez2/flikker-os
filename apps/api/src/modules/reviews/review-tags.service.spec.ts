import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ReviewTagsService } from './review-tags.service';
import { ReviewTagsRepository } from './review-tags.repository';
import { ReviewsRepository } from './reviews.repository';

const BUSINESS_ID = 'biz-1';
const TAG_ID = 'tag-1';
const REVIEW_ID = 'rev-1';

const mockTag = {
  id: TAG_ID,
  businessId: BUSINESS_ID,
  name: 'Servicio',
  slug: 'servicio',
  color: '#FF0000',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockReview = {
  id: REVIEW_ID,
  businessId: BUSINESS_ID,
};

const mockTagsRepo = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  findBySlug: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findRelation: jest.fn(),
  assignTag: jest.fn(),
  unassignTag: jest.fn(),
};

const mockReviewsRepo = {
  findOne: jest.fn(),
};

describe('ReviewTagsService', () => {
  let service: ReviewTagsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewTagsService,
        { provide: ReviewTagsRepository, useValue: mockTagsRepo },
        { provide: ReviewsRepository, useValue: mockReviewsRepo },
      ],
    }).compile();

    service = module.get<ReviewTagsService>(ReviewTagsService);
  });

  // ---------------------------------------------------------------------------
  // slugify
  // ---------------------------------------------------------------------------
  describe('slugify', () => {
    it('converts name to lowercase slug', () => {
      expect(ReviewTagsService.slugify('Servicio')).toBe('servicio');
    });

    it('removes accents', () => {
      expect(ReviewTagsService.slugify('Atención')).toBe('atencion');
    });

    it('replaces spaces and special chars with hyphens', () => {
      expect(ReviewTagsService.slugify('Muy Buena Onda!')).toBe(
        'muy-buena-onda',
      );
    });

    it('trims leading/trailing hyphens', () => {
      expect(ReviewTagsService.slugify('--test--')).toBe('test');
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    it('creates a tag with derived slug', async () => {
      mockTagsRepo.findBySlug.mockResolvedValue(null);
      mockTagsRepo.create.mockResolvedValue(mockTag);

      const result = await service.create(BUSINESS_ID, {
        name: 'Servicio',
        color: '#FF0000',
      });

      expect(result.id).toBe(TAG_ID);
      expect(mockTagsRepo.findBySlug).toHaveBeenCalledWith(
        BUSINESS_ID,
        'servicio',
      );
      expect(mockTagsRepo.create).toHaveBeenCalledWith(BUSINESS_ID, {
        name: 'Servicio',
        slug: 'servicio',
        color: '#FF0000',
      });
    });

    it('throws ConflictException if slug already exists', async () => {
      mockTagsRepo.findBySlug.mockResolvedValue(mockTag);

      await expect(
        service.create(BUSINESS_ID, { name: 'Servicio' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------
  describe('update', () => {
    it('updates tag name and re-derives slug', async () => {
      mockTagsRepo.findOne.mockResolvedValue(mockTag);
      mockTagsRepo.findBySlug.mockResolvedValue(null);
      mockTagsRepo.update.mockResolvedValue({
        ...mockTag,
        name: 'Limpieza',
        slug: 'limpieza',
      });

      const result = await service.update(BUSINESS_ID, TAG_ID, {
        name: 'Limpieza',
      });

      expect(result.name).toBe('Limpieza');
      expect(mockTagsRepo.update).toHaveBeenCalledWith(BUSINESS_ID, TAG_ID, {
        name: 'Limpieza',
        slug: 'limpieza',
      });
    });

    it('throws NotFoundException if tag missing', async () => {
      mockTagsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(BUSINESS_ID, 'missing', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if new slug collides with another tag', async () => {
      mockTagsRepo.findOne.mockResolvedValue(mockTag);
      mockTagsRepo.findBySlug.mockResolvedValue({
        ...mockTag,
        id: 'other-tag',
      });

      await expect(
        service.update(BUSINESS_ID, TAG_ID, { name: 'Servicio' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------
  describe('delete', () => {
    it('deletes tag and its relations', async () => {
      mockTagsRepo.findOne.mockResolvedValue(mockTag);

      await service.delete(BUSINESS_ID, TAG_ID);

      expect(mockTagsRepo.delete).toHaveBeenCalledWith(BUSINESS_ID, TAG_ID);
    });

    it('throws NotFoundException if tag missing', async () => {
      mockTagsRepo.findOne.mockResolvedValue(null);

      await expect(service.delete(BUSINESS_ID, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // assignTag
  // ---------------------------------------------------------------------------
  describe('assignTag', () => {
    it('assigns tag to review', async () => {
      mockReviewsRepo.findOne.mockResolvedValue(mockReview);
      mockTagsRepo.findOne.mockResolvedValue(mockTag);
      mockTagsRepo.findRelation.mockResolvedValue(null);
      mockTagsRepo.assignTag.mockResolvedValue({
        id: 'rel-1',
        reviewId: REVIEW_ID,
        tagId: TAG_ID,
      });

      const result = await service.assignTag(BUSINESS_ID, REVIEW_ID, TAG_ID);

      expect(result.reviewId).toBe(REVIEW_ID);
    });

    it('throws NotFoundException if review missing', async () => {
      mockReviewsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assignTag(BUSINESS_ID, 'missing', TAG_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if tag not from this business', async () => {
      mockReviewsRepo.findOne.mockResolvedValue(mockReview);
      mockTagsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assignTag(BUSINESS_ID, REVIEW_ID, 'wrong-tag'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if already assigned', async () => {
      mockReviewsRepo.findOne.mockResolvedValue(mockReview);
      mockTagsRepo.findOne.mockResolvedValue(mockTag);
      mockTagsRepo.findRelation.mockResolvedValue({ id: 'rel-1' });

      await expect(
        service.assignTag(BUSINESS_ID, REVIEW_ID, TAG_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ---------------------------------------------------------------------------
  // unassignTag
  // ---------------------------------------------------------------------------
  describe('unassignTag', () => {
    it('unassigns tag from review', async () => {
      mockReviewsRepo.findOne.mockResolvedValue(mockReview);

      await service.unassignTag(BUSINESS_ID, REVIEW_ID, TAG_ID);

      expect(mockTagsRepo.unassignTag).toHaveBeenCalledWith(REVIEW_ID, TAG_ID);
    });

    it('throws NotFoundException if review missing', async () => {
      mockReviewsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.unassignTag(BUSINESS_ID, 'missing', TAG_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
