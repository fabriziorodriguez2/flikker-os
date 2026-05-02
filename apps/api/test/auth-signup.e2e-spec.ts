import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from './../src/app.module';

interface SignupResponseBody {
  accessToken: string;
  refreshToken: string;
  memberships: Array<{ role: string }>;
}

describe('Auth signup (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  const email = `signup-${Date.now()}@flikker.dev`;
  const signupBody = {
    email,
    password: 'Flikker2026!',
    businessName: 'Signup Dental Test',
    vertical: 'dental',
    timezone: 'America/Montevideo',
  };

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret';

    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });
    prisma = new PrismaClient({ adapter });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        memberships: { select: { businessId: true } },
      },
    });

    if (user) {
      const businessIds = user.memberships.map(
        (membership) => membership.businessId,
      );

      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id },
      });
      await prisma.membership.deleteMany({ where: { userId: user.id } });
      await prisma.subscription.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
      await prisma.user.delete({ where: { id: user.id } });
    }

    await prisma.$disconnect();
    await app.close();
  });

  it('creates user and business, then rejects duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(signupBody)
      .expect(201)
      .expect((response) => {
        const body = response.body as SignupResponseBody;

        expect(body.accessToken).toEqual(expect.any(String));
        expect(body.refreshToken).toEqual(expect.any(String));
        expect(body.memberships).toHaveLength(1);
        expect(body.memberships[0].role).toBe('OWNER');
      });

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send(signupBody)
      .expect(409);
  });
});
