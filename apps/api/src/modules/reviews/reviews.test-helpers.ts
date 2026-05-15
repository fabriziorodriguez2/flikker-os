import { randomUUID } from 'crypto';
import {
  BusinessStatus,
  CampaignChannel,
  CampaignStatus,
  DestinationType,
  MembershipRole,
  MembershipStatus,
  ReviewSource,
  ReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReviewsTestContext {
  userId: string;
  businessId: string;
  membershipId: string;
}

export interface CampaignTestContext {
  campaignId: string;
}

export interface ReviewTestContext {
  reviewId: string;
}

export function makeTestSuffix() {
  return randomUUID().slice(0, 8);
}

export async function createTestUser(
  prisma: PrismaService,
  suffix: string,
  overrides: Partial<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  }> = {},
) {
  return prisma.user.create({
    data: {
      id: overrides.id ?? randomUUID(),
      email: overrides.email ?? `reviews-${suffix}@test.local`,
      passwordHash: 'test-hash',
      firstName: overrides.firstName ?? 'Reviews',
      lastName: overrides.lastName ?? 'Tester',
    },
  });
}

export async function createTestBusiness(
  prisma: PrismaService,
  suffix: string,
  overrides: Partial<{
    id: string;
    name: string;
    slug: string;
    status: BusinessStatus;
  }> = {},
) {
  return prisma.business.create({
    data: {
      id: overrides.id ?? randomUUID(),
      name: overrides.name ?? `Business ${suffix}`,
      slug: overrides.slug ?? `reviews-${suffix}`,
      status: overrides.status ?? BusinessStatus.ACTIVE,
      country: 'UY',
      timezone: 'America/Montevideo',
      currency: 'UYU',
      isActive: true,
    },
  });
}

export async function createTestMembership(
  prisma: PrismaService,
  userId: string,
  businessId: string,
  role: MembershipRole = MembershipRole.ADMIN,
  status: MembershipStatus = MembershipStatus.ACTIVE,
) {
  return prisma.membership.create({
    data: {
      id: randomUUID(),
      userId,
      businessId,
      role,
      status,
    },
  });
}

export async function createTestCampaign(
  prisma: PrismaService,
  businessId: string,
  createdByUserId: string,
  suffix: string,
  overrides: Partial<{
    id: string;
    name: string;
    slug: string;
    channel: CampaignChannel;
    status: CampaignStatus;
    destinationType: DestinationType;
    destinationUrl: string | null;
  }> = {},
) {
  return prisma.campaign.create({
    data: {
      id: overrides.id ?? randomUUID(),
      businessId,
      createdByUserId,
      name: overrides.name ?? `Campaign ${suffix}`,
      slug: overrides.slug ?? `campaign-${suffix}`,
      channel: overrides.channel ?? CampaignChannel.QR_COUNTER,
      status: overrides.status ?? CampaignStatus.ACTIVE,
      destinationType:
        overrides.destinationType ?? DestinationType.GOOGLE_REVIEW,
      destinationUrl:
        overrides.destinationUrl === undefined
          ? 'https://example.com/review'
          : overrides.destinationUrl,
    },
  });
}

export async function createTestReview(
  prisma: PrismaService,
  businessId: string,
  suffix: string,
  overrides: Partial<{
    id: string;
    campaignId: string | null;
    source: ReviewSource;
    externalReviewId: string | null;
    authorDisplayName: string | null;
    rating: number;
    content: string | null;
    reviewedAt: Date;
    status: ReviewStatus;
    isHighlighted: boolean;
    respondedAt: Date | null;
    respondedByUserId: string | null;
    createdByUserId: string | null;
  }> = {},
) {
  const review = await prisma.review.create({
    data: {
      id: overrides.id ?? randomUUID(),
      businessId,
      campaignId:
        overrides.campaignId === undefined ? undefined : overrides.campaignId,
      source: overrides.source ?? ReviewSource.MANUAL,
      externalReviewId:
        overrides.externalReviewId === undefined
          ? `ext-${suffix}`
          : overrides.externalReviewId,
      authorDisplayName:
        overrides.authorDisplayName === undefined
          ? `Author ${suffix}`
          : overrides.authorDisplayName,
      rating: overrides.rating ?? 5,
      content:
        overrides.content === undefined
          ? `Review content ${suffix}`
          : overrides.content,
      reviewedAt: overrides.reviewedAt ?? new Date('2026-04-01T12:00:00.000Z'),
      status: overrides.status ?? ReviewStatus.NEW,
      isHighlighted: overrides.isHighlighted ?? false,
      respondedAt:
        overrides.respondedAt === undefined ? null : overrides.respondedAt,
      respondedByUserId:
        overrides.respondedByUserId === undefined
          ? null
          : overrides.respondedByUserId,
      createdByUserId:
        overrides.createdByUserId === undefined
          ? null
          : overrides.createdByUserId,
      statusHistory: {
        create: {
          fromStatus: null,
          toStatus: overrides.status ?? ReviewStatus.NEW,
          changedByUserId:
            overrides.createdByUserId === undefined
              ? null
              : overrides.createdByUserId,
        },
      },
    },
  });

  return review;
}

export async function createTestResponse(
  prisma: PrismaService,
  businessId: string,
  reviewId: string,
  respondedByUserId: string,
  content = 'Thank you for your review',
) {
  const respondedAt = new Date('2026-04-05T12:00:00.000Z');

  const response = await prisma.response.create({
    data: {
      businessId,
      reviewId,
      content,
      respondedByUserId,
      respondedAt,
    },
  });

  await prisma.review.update({
    where: { id: reviewId },
    data: {
      status: ReviewStatus.RESPONDED,
      respondedAt,
      respondedByUserId,
    },
  });

  return response;
}

export async function cleanupReviewTestData(
  prisma: PrismaService,
  ids: {
    responseIds?: string[];
    reviewIds?: string[];
    campaignIds?: string[];
    membershipIds?: string[];
    businessIds?: string[];
    userIds?: string[];
  },
) {
  if (ids.responseIds?.length) {
    await prisma.response.deleteMany({
      where: { id: { in: ids.responseIds } },
    });
  }

  if (ids.reviewIds?.length) {
    await prisma.response.deleteMany({
      where: { reviewId: { in: ids.reviewIds } },
    });
    await prisma.reviewStatusHistory.deleteMany({
      where: { reviewId: { in: ids.reviewIds } },
    });
    await prisma.reviewTagRelation.deleteMany({
      where: { reviewId: { in: ids.reviewIds } },
    });
    await prisma.review.deleteMany({ where: { id: { in: ids.reviewIds } } });
  }

  if (ids.campaignIds?.length) {
    await prisma.qrCode.deleteMany({
      where: { campaignId: { in: ids.campaignIds } },
    });
    await prisma.scanEvent.deleteMany({
      where: { campaignId: { in: ids.campaignIds } },
    });
    await prisma.campaign.deleteMany({
      where: { id: { in: ids.campaignIds } },
    });
  }

  if (ids.membershipIds?.length) {
    await prisma.membership.deleteMany({
      where: { id: { in: ids.membershipIds } },
    });
  }

  if (ids.businessIds?.length) {
    await prisma.response.deleteMany({
      where: { businessId: { in: ids.businessIds } },
    });
    await prisma.reviewTag.deleteMany({
      where: { businessId: { in: ids.businessIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { businessId: { in: ids.businessIds } },
    });
    await prisma.branch.deleteMany({
      where: { businessId: { in: ids.businessIds } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: ids.businessIds } },
    });
  }

  if (ids.userIds?.length) {
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: ids.userIds } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: ids.userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
}
