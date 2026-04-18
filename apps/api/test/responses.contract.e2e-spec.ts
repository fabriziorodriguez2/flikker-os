import 'dotenv/config';
import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole, ReviewStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtGuard } from '../src/modules/auth/guards/jwt.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  cleanupReviewTestData,
  createTestBusiness,
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
      email: 'responses@test.local',
      firstName: 'Responses',
      lastName: 'Tester',
      isActive: true,
      isPlatformAdmin: false,
    };

    return true;
  }
}

describe('Responses contract (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const createdIds = {
    responseIds: [] as string[],
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
    createdIds.responseIds = [];
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

  it('creates, fetches and updates a response while syncing the review state', async () => {
    const suffix = makeTestSuffix();
    const user = await createTestUser(prisma, `${suffix}-user`);
    const business = await createTestBusiness(prisma, `${suffix}-biz`);
    const membership = await createTestMembership(
      prisma,
      user.id,
      business.id,
      MembershipRole.OPERATOR,
    );
    const review = await createTestReview(prisma, business.id, `${suffix}-review`, {
      status: ReviewStatus.REVIEWED,
      createdByUserId: user.id,
    });

    createdIds.userIds.push(user.id);
    createdIds.businessIds.push(business.id);
    createdIds.membershipIds.push(membership.id);
    createdIds.reviewIds.push(review.id);

    const headers = {
      'x-business-id': business.id,
      'x-test-user-id': user.id,
    };

    const createResponse = await request(app.getHttpServer())
      .post('/responses')
      .set(headers)
      .send({
        reviewId: review.id,
        content: 'Thanks for training with us',
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      businessId: business.id,
      reviewId: review.id,
      content: 'Thanks for training with us',
      respondedByUserId: user.id,
      respondedAt: expect.any(String),
    });

    const responseId = createResponse.body.id as string;
    createdIds.responseIds.push(responseId);

    const getByReview = await request(app.getHttpServer())
      .get(`/reviews/${review.id}/response`)
      .set(headers)
      .expect(200);

    expect(getByReview.body).toMatchObject({
      id: responseId,
      reviewId: review.id,
      content: 'Thanks for training with us',
    });

    const updateResponse = await request(app.getHttpServer())
      .patch(`/responses/${responseId}`)
      .set(headers)
      .send({ content: 'Updated manual response' })
      .expect(200);

    expect(updateResponse.body).toMatchObject({
      id: responseId,
      content: 'Updated manual response',
      respondedByUserId: user.id,
    });

    const syncedReview = await request(app.getHttpServer())
      .get(`/reviews/${review.id}`)
      .set(headers)
      .expect(200);

    expect(syncedReview.body.status).toBe(ReviewStatus.RESPONDED);
    expect(syncedReview.body.respondedByUserId).toBe(user.id);
    expect(syncedReview.body.respondedAt).toEqual(expect.any(String));
  });

  it('enforces tenant access for responses', async () => {
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
    const foreignReview = await createTestReview(
      prisma,
      otherBusiness.id,
      `${suffix}-foreign-review`,
    );

    createdIds.userIds.push(user.id);
    createdIds.businessIds.push(business.id, otherBusiness.id);
    createdIds.membershipIds.push(membership.id);
    createdIds.reviewIds.push(foreignReview.id);

    await request(app.getHttpServer())
      .post('/responses')
      .set({
        'x-business-id': business.id,
        'x-test-user-id': user.id,
      })
      .send({
        reviewId: foreignReview.id,
        content: 'Should be rejected',
      })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/reviews/${foreignReview.id}/response`)
      .set({
        'x-business-id': otherBusiness.id,
        'x-test-user-id': user.id,
      })
      .expect(403);
  });
});
