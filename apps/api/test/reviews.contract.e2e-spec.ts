import 'dotenv/config';
import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole, ReviewSource, ReviewStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtGuard } from '../src/modules/auth/guards/jwt.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  cleanupReviewTestData,
  createTestBusiness,
  createTestCampaign,
  createTestMembership,
  createTestReview,
  createTestUser,
  makeTestSuffix,
} from '../src/modules/reviews/reviews.test-helpers';

class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-test-user-id'];

    request.user = {
      id: Array.isArray(userId) ? userId[0] : userId ?? 'missing-user',
      email: 'reviews@test.local',
      firstName: 'Reviews',
      lastName: 'Tester',
      isActive: true,
      isPlatformAdmin: false,
    };

    return true;
  }
}

describe('Reviews contract (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const createdIds = {
    reviewIds: [] as string[],
    campaignIds: [] as string[],
    membershipIds: [] as string[],
    businessIds: [] as string[],
    userIds: [] as string[],
  };

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtGuard)
      .useClass(FakeJwtGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
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
    if (app) {
      await app.close();
    }
  });

  it('creates a review, lists tenant-scoped reviews, filters them, finds one, and toggles responded/highlight', async () => {
    const suffix = makeTestSuffix();
    const user = await createTestUser(prisma, `${suffix}-user`);
    const business = await createTestBusiness(prisma, `${suffix}-biz`);
    const otherBusiness = await createTestBusiness(prisma, `${suffix}-other`);
    const membership = await createTestMembership(
      prisma,
      user.id,
      business.id,
      MembershipRole.ADMIN,
    );
    const campaign = await createTestCampaign(
      prisma,
      business.id,
      user.id,
      `${suffix}-campaign`,
    );
    const existingReview = await createTestReview(
      prisma,
      business.id,
      `${suffix}-existing`,
      {
        campaignId: campaign.id,
        rating: 3,
        content: 'Existing review for filters',
      },
    );
    const otherTenantReview = await createTestReview(
      prisma,
      otherBusiness.id,
      `${suffix}-other-review`,
      {
        content: 'Other tenant',
      },
    );

    createdIds.userIds.push(user.id);
    createdIds.businessIds.push(business.id, otherBusiness.id);
    createdIds.membershipIds.push(membership.id);
    createdIds.campaignIds.push(campaign.id);
    createdIds.reviewIds.push(existingReview.id, otherTenantReview.id);

    const headers = {
      'x-business-id': business.id,
      'x-test-user-id': user.id,
    };

    const createResponse = await request(app.getHttpServer())
      .post('/reviews')
      .set(headers)
      .send({
        source: ReviewSource.MANUAL,
        rating: 5,
        reviewedAt: '2026-04-05T15:00:00.000Z',
        content: 'Great service and very fast',
        authorDisplayName: 'Lucia',
        campaignId: campaign.id,
        externalReviewId: `ext-${randomUUID()}`,
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      businessId: business.id,
      campaignId: campaign.id,
      rating: 5,
      authorDisplayName: 'Lucia',
      isHighlighted: false,
      status: ReviewStatus.NEW,
      respondedAt: null,
      respondedByUserId: null,
    });

    const createdReviewId = createResponse.body.id as string;
    createdIds.reviewIds.push(createdReviewId);

    const listResponse = await request(app.getHttpServer())
      .get('/reviews')
      .set(headers)
      .query({
        campaignId: campaign.id,
        ratingMin: 4,
        responded: false,
        isHighlighted: false,
      })
      .expect(200);

    expect(listResponse.body.total).toBe(1);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      id: createdReviewId,
      businessId: business.id,
      campaign: { id: campaign.id, name: campaign.name },
    });

    const findOneResponse = await request(app.getHttpServer())
      .get(`/reviews/${createdReviewId}`)
      .set(headers)
      .expect(200);

    expect(findOneResponse.body).toMatchObject({
      id: createdReviewId,
      content: 'Great service and very fast',
      campaign: { id: campaign.id, name: campaign.name, slug: campaign.slug },
    });

    const respondedResponse = await request(app.getHttpServer())
      .post(`/reviews/${createdReviewId}/mark-responded`)
      .set(headers)
      .expect(201);

    expect(respondedResponse.body.status).toBe(ReviewStatus.RESPONDED);
    expect(respondedResponse.body.respondedByUserId).toBe(user.id);
    expect(respondedResponse.body.respondedAt).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post(`/reviews/${createdReviewId}/highlight`)
      .set(headers)
      .expect(201);

    const highlightedList = await request(app.getHttpServer())
      .get('/reviews')
      .set(headers)
      .query({
        campaignId: campaign.id,
        ratingMin: 4,
        responded: true,
        isHighlighted: true,
      })
      .expect(200);

    expect(highlightedList.body.total).toBe(1);
    expect(highlightedList.body.data[0]).toMatchObject({
      id: createdReviewId,
      isHighlighted: true,
      respondedAt: expect.any(String),
    });

    const unhighlightedResponse = await request(app.getHttpServer())
      .post(`/reviews/${createdReviewId}/unhighlight`)
      .set(headers)
      .expect(201);

    expect(unhighlightedResponse.body.isHighlighted).toBe(false);
  });

  it('enforces tenant membership and cross-tenant access rules', async () => {
    const suffix = makeTestSuffix();
    const user = await createTestUser(prisma, `${suffix}-user`);
    const business = await createTestBusiness(prisma, `${suffix}-biz`);
    const otherBusiness = await createTestBusiness(prisma, `${suffix}-other`);
    const membership = await createTestMembership(
      prisma,
      user.id,
      business.id,
      MembershipRole.OPERATOR,
    );
    const ownReview = await createTestReview(prisma, business.id, `${suffix}-own`);
    const foreignReview = await createTestReview(
      prisma,
      otherBusiness.id,
      `${suffix}-foreign`,
    );

    createdIds.userIds.push(user.id);
    createdIds.businessIds.push(business.id, otherBusiness.id);
    createdIds.membershipIds.push(membership.id);
    createdIds.reviewIds.push(ownReview.id, foreignReview.id);

    await request(app.getHttpServer())
      .get('/reviews')
      .set({
        'x-business-id': otherBusiness.id,
        'x-test-user-id': user.id,
      })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/reviews/${foreignReview.id}`)
      .set({
        'x-business-id': business.id,
        'x-test-user-id': user.id,
      })
      .expect(404);
  });
});
