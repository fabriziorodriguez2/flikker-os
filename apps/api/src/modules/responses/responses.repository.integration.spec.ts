import { Test, TestingModule } from '@nestjs/testing';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  cleanupReviewTestData,
  createTestBusiness,
  createTestMembership,
  createTestResponse,
  createTestReview,
  createTestUser,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';
import { ResponsesRepository } from './responses.repository';

describe('ResponsesRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: ResponsesRepository;

  const createdIds = {
    responseIds: [] as string[],
    reviewIds: [] as string[],
    campaignIds: [] as string[],
    membershipIds: [] as string[],
    businessIds: [] as string[],
    userIds: [] as string[],
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, ResponsesRepository],
    }).compile();

    prisma = module.get(PrismaService);
    repository = module.get(ResponsesRepository);
    await prisma.$connect();
  });

  afterEach(async () => {
    await cleanupReviewTestData(prisma, createdIds);
    createdIds.responseIds = [];
    createdIds.reviewIds = [];
    createdIds.campaignIds = [];
    createdIds.membershipIds = [];
    createdIds.businessIds = [];
    createdIds.userIds = [];
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a response and syncs review responded state', async () => {
    const suffix = makeTestSuffix();
    const user = await createTestUser(prisma, `${suffix}-user`);
    const business = await createTestBusiness(prisma, `${suffix}-biz`);
    const membership = await createTestMembership(prisma, user.id, business.id);
    const review = await createTestReview(
      prisma,
      business.id,
      `${suffix}-review`,
      {
        status: ReviewStatus.REVIEWED,
        createdByUserId: user.id,
      },
    );

    createdIds.userIds.push(user.id);
    createdIds.businessIds.push(business.id);
    createdIds.membershipIds.push(membership.id);
    createdIds.reviewIds.push(review.id);

    const response = await repository.create(
      business.id,
      review.id,
      'Thank you for your feedback',
      user.id,
    );

    createdIds.responseIds.push(response.id);

    expect(response.reviewId).toBe(review.id);
    expect(response.respondedByUserId).toBe(user.id);

    const syncedReview = await prisma.review.findUniqueOrThrow({
      where: { id: review.id },
      select: {
        status: true,
        respondedAt: true,
        respondedByUserId: true,
      },
    });

    expect(syncedReview.status).toBe(ReviewStatus.RESPONDED);
    expect(syncedReview.respondedAt).toBeInstanceOf(Date);
    expect(syncedReview.respondedByUserId).toBe(user.id);
  });

  it('finds and updates a response within the tenant', async () => {
    const suffix = makeTestSuffix();
    const user = await createTestUser(prisma, `${suffix}-user`);
    const business = await createTestBusiness(prisma, `${suffix}-biz`);
    const membership = await createTestMembership(prisma, user.id, business.id);
    const review = await createTestReview(
      prisma,
      business.id,
      `${suffix}-review`,
      {
        status: ReviewStatus.REVIEWED,
        createdByUserId: user.id,
      },
    );
    const response = await createTestResponse(
      prisma,
      business.id,
      review.id,
      user.id,
      'Original response',
    );

    createdIds.userIds.push(user.id);
    createdIds.businessIds.push(business.id);
    createdIds.membershipIds.push(membership.id);
    createdIds.reviewIds.push(review.id);
    createdIds.responseIds.push(response.id);

    const byReview = await repository.findByReview(business.id, review.id);
    expect(byReview?.id).toBe(response.id);

    const updated = await repository.update(
      business.id,
      response.id,
      'Updated response',
      user.id,
    );

    expect(updated.content).toBe('Updated response');

    const syncedReview = await prisma.review.findUniqueOrThrow({
      where: { id: review.id },
      select: { status: true, respondedAt: true, respondedByUserId: true },
    });

    expect(syncedReview.status).toBe(ReviewStatus.RESPONDED);
    expect(syncedReview.respondedAt).toBeInstanceOf(Date);
    expect(syncedReview.respondedByUserId).toBe(user.id);
  });
});
