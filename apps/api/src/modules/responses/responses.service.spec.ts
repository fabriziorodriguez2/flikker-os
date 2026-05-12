import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ReviewSource, ReviewStatus } from '@prisma/client';
import { ReviewsRepository } from '../reviews/reviews.repository';
import { ResponsesRepository } from './responses.repository';
import { ResponsesService } from './responses.service';

const BUSINESS_ID = 'biz-1';
const REVIEW_ID = 'rev-1';
const RESPONSE_ID = 'res-1';
const USER_ID = 'usr-1';

const mockReview = {
  id: REVIEW_ID,
  businessId: BUSINESS_ID,
  branchId: null,
  campaignId: null,
  source: ReviewSource.GOOGLE,
  externalReviewId: null,
  authorDisplayName: 'Maria',
  rating: 5,
  title: null,
  content: 'Great service',
  reviewedAt: new Date(),
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
  response: null,
};

const mockResponse = {
  id: RESPONSE_ID,
  businessId: BUSINESS_ID,
  reviewId: REVIEW_ID,
  content: 'Thanks for visiting',
  respondedAt: new Date(),
  respondedByUserId: USER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  respondedBy: {
    id: USER_ID,
    firstName: 'Test',
    lastName: 'User',
  },
  review: {
    id: REVIEW_ID,
    businessId: BUSINESS_ID,
    status: ReviewStatus.RESPONDED,
    respondedAt: new Date(),
    respondedByUserId: USER_ID,
  },
};

const mockResponsesRepository = {
  findOne: jest.fn(),
  findByReview: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockReviewsRepository = {
  findOne: jest.fn(),
};

describe('ResponsesService', () => {
  let service: ResponsesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResponsesService,
        { provide: ResponsesRepository, useValue: mockResponsesRepository },
        { provide: ReviewsRepository, useValue: mockReviewsRepository },
      ],
    }).compile();

    service = module.get<ResponsesService>(ResponsesService);
  });

  it('creates a response for an editable review', async () => {
    mockReviewsRepository.findOne.mockResolvedValue(mockReview);
    mockResponsesRepository.findByReview.mockResolvedValue(null);
    mockResponsesRepository.create.mockResolvedValue(mockResponse);

    const result = await service.create(
      BUSINESS_ID,
      { reviewId: REVIEW_ID, content: ' Thanks for visiting ' },
      USER_ID,
    );

    expect(result.id).toBe(RESPONSE_ID);
    expect(mockResponsesRepository.create).toHaveBeenCalledWith(
      BUSINESS_ID,
      REVIEW_ID,
      'Thanks for visiting',
      USER_ID,
    );
  });

  it('rejects creating a second response for the same review', async () => {
    mockReviewsRepository.findOne.mockResolvedValue(mockReview);
    mockResponsesRepository.findByReview.mockResolvedValue(mockResponse);

    await expect(
      service.create(
        BUSINESS_ID,
        { reviewId: REVIEW_ID, content: 'Another answer' },
        USER_ID,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects creating a response on archived reviews', async () => {
    mockReviewsRepository.findOne.mockResolvedValue({
      ...mockReview,
      status: ReviewStatus.ARCHIVED,
    });

    await expect(
      service.create(
        BUSINESS_ID,
        { reviewId: REVIEW_ID, content: 'Reply' },
        USER_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns a response by review within the tenant', async () => {
    mockReviewsRepository.findOne.mockResolvedValue(mockReview);
    mockResponsesRepository.findByReview.mockResolvedValue(mockResponse);

    const result = await service.findByReview(BUSINESS_ID, REVIEW_ID);

    expect(result.id).toBe(RESPONSE_ID);
  });

  it('throws when response is missing for a review', async () => {
    mockReviewsRepository.findOne.mockResolvedValue(mockReview);
    mockResponsesRepository.findByReview.mockResolvedValue(null);

    await expect(service.findByReview(BUSINESS_ID, REVIEW_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates an existing response', async () => {
    mockResponsesRepository.findOne.mockResolvedValue(mockResponse);
    mockReviewsRepository.findOne.mockResolvedValue({
      ...mockReview,
      status: ReviewStatus.RESPONDED,
    });
    mockResponsesRepository.update.mockResolvedValue({
      ...mockResponse,
      content: 'Updated answer',
    });

    const result = await service.update(
      BUSINESS_ID,
      RESPONSE_ID,
      { content: ' Updated answer ' },
      USER_ID,
    );

    expect(result.content).toBe('Updated answer');
    expect(mockResponsesRepository.update).toHaveBeenCalledWith(
      BUSINESS_ID,
      RESPONSE_ID,
      'Updated answer',
      USER_ID,
    );
  });

  it('throws when updating a missing response', async () => {
    mockResponsesRepository.findOne.mockResolvedValue(null);

    await expect(
      service.update(BUSINESS_ID, RESPONSE_ID, { content: 'Reply' }, USER_ID),
    ).rejects.toThrow(NotFoundException);
  });
});
