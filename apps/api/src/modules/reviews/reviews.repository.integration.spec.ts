import { Test, TestingModule } from '@nestjs/testing';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReviewsRepository } from './reviews.repository';
import {
  cleanupReviewTestData,
  createTestBusiness,
  createTestCampaign,
  createTestMembership,
  createTestReview,
  createTestUser,
  makeTestSuffix,
} from './reviews.test-helpers';

describe('ReviewsRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: ReviewsRepository;

  const createdIds = {
    reviewIds: [] as string[],
    campaignIds: [] as string[],
    membershipIds: [] as string[],
    businessIds: [] as string[],
    userIds: [] as string[],
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, ReviewsRepository],
    }).compile();

    prisma = module.get(PrismaService);
    repository = module.get(ReviewsRepository);
    await prisma.$connect();
  });

  afterEach(async () => {
    await cleanupReviewTestData(prisma, createdIds);
    createdIds.reviewIds = [];
    createdIds.campaignIds = [];
    createdIds.membershipIds = [];
    createdIds.businessIds = [];
    createdIds.userIds = [];
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lists only reviews for the requested tenant and applies MVP filters', async () => {
    const suffix = makeTestSuffix();
    const user = await createTestUser(prisma, `${suffix}-user`);
    const business = await createTestBusiness(prisma, `${suffix}-biz`);
    const otherBusiness = await createTestBusiness(prisma, `${suffix}-other`);
    const membership = await createTestMembership(prisma, user.id, business.id);
    const campaign = await createTestCampaign(
      prisma,
      business.id,
      user.id,
      `${suffix}-campaign`,
    );

    createdIds.userIds.push(user.id);
    createdIds.businessIds.push(business.id, otherBusiness.id);
    createdIds.membershipIds.push(membership.id);
    createdIds.campaignIds.push(campaign.id);

    const highlightedResponded = await createTestReview(
      prisma,
      business.id,
      `${suffix}-1`,
      {
        campaignId: campaign.id,
        rating: 5,
        isHighlighted: true,
        status: ReviewStatus.RESPONDED,
        respondedAt: new Date('2026-04-02T10:00:00.000Z'),
        respondedByUserId: user.id,
        content: 'The best experience',
        authorDisplayName: 'Maria',
      },
    );

    const lowRating = await createTestReview(
      prisma,
      business.id,
      `${suffix}-2`,
      {
        rating: 2,
        content: 'Average service',
        authorDisplayName: 'Pedro',
      },
    );

    const otherTenantReview = await createTestReview(
      prisma,
      otherBusiness.id,
      `${suffix}-3`,
      {
        rating: 5,
        isHighlighted: true,
        status: ReviewStatus.RESPONDED,
        respondedAt: new Date('2026-04-02T10:00:00.000Z'),
        content: 'Other tenant review',
      },
    );

    createdIds.reviewIds.push(
      highlightedResponded.id,
      lowRating.id,
      otherTenantReview.id,
    );

    const result = await repository.findMany(business.id, {
      responded: true,
      isHighlighted: true,
      campaignId: campaign.id,
      ratingMin: 4,
      search: 'best',
    });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(highlightedResponded.id);
    expect(result.data[0]?.businessId).toBe(business.id);
    expect(result.data[0]?.respondedBy?.id).toBe(user.id);
  });

  it('findOne is tenant-scoped and updateStatus persists responded metadata', async () => {
    const suffix = makeTestSuffix();
    const user = await createTestUser(prisma, `${suffix}-user`);
    const business = await createTestBusiness(prisma, `${suffix}-biz`);
    const otherBusiness = await createTestBusiness(prisma, `${suffix}-other`);
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
    const otherTenantReview = await createTestReview(
      prisma,
      otherBusiness.id,
      `${suffix}-other-review`,
    );

    createdIds.userIds.push(user.id);
    createdIds.businessIds.push(business.id, otherBusiness.id);
    createdIds.membershipIds.push(membership.id);
    createdIds.reviewIds.push(review.id, otherTenantReview.id);

    const missing = await repository.findOne(business.id, otherTenantReview.id);
    expect(missing).toBeNull();

    const responded = await repository.updateStatus(
      business.id,
      review.id,
      ReviewStatus.RESPONDED,
      user.id,
    );

    expect(responded.status).toBe(ReviewStatus.RESPONDED);
    expect(responded.respondedAt).toBeInstanceOf(Date);
    expect(responded.respondedByUserId).toBe(user.id);

    const unresponded = await repository.updateStatus(
      business.id,
      review.id,
      ReviewStatus.REVIEWED,
      user.id,
    );

    expect(unresponded.status).toBe(ReviewStatus.REVIEWED);
    expect(unresponded.respondedAt).toBeNull();
    expect(unresponded.respondedByUserId).toBeNull();
  });
});
