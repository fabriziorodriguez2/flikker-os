import 'dotenv/config';
import {
  INestApplication,
  ValidationPipe,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole } from '@prisma/client';
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
  createTestUser,
  makeTestSuffix,
} from '../src/modules/reviews/reviews.test-helpers';

/**
 * Bug real (auditado): un OWNER de un negocio LEGACY quedaba sin poder
 * entrar a NINGUNA pantalla del panel, incluida `/dashboard/customers`.
 *
 * Causa: `OnboardingService#findDraft` filtraba solo `onboardingCompletedAt:
 * null` — campo que un negocio LEGACY (que nunca pasó por el onboarding
 * self-service) tiene en null PARA SIEMPRE, no porque tenga un draft en
 * curso. Eso lo hacía calzar como "borrador de CHECKIN_V2 en progreso", y
 * `(panel)/layout.tsx` mandaba a CUALQUIER OWNER en esa situación a
 * `/comenzar` en cada navegación.
 *
 * Esta suite fija dos cosas: que un negocio LEGACY nunca vuelve a calzar como
 * draft (la causa real), y que el resto de la cadena de guards que protege
 * `/customers` distingue 401 de 403 tal como exige el producto — nunca hay
 * que confundir "sesión inválida" con "tenant/rol equivocado".
 */
class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-test-user-id'];
    req.user = {
      id: Array.isArray(userId) ? userId[0] : (userId ?? 'missing-user'),
      email: 'legacy-access@test.local',
      firstName: 'Legacy',
      lastName: 'Access',
      isActive: true,
      isPlatformAdmin: false,
    };
    return true;
  }
}

describe('Clientes LEGACY — acceso al panel (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdIds = {
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

  afterAll(async () => {
    await cleanupReviewTestData(prisma, createdIds);
    if (app) await app.close();
  });

  async function setupLegacyBusiness(role: MembershipRole) {
    const suffix = makeTestSuffix();
    const user = await createTestUser(prisma, `${suffix}-${role}`);
    // `createTestBusiness` no fija `experienceVersion` — el default del
    // schema es LEGACY, que es exactamente el caso real que rompía.
    const business = await createTestBusiness(prisma, `${suffix}-biz`);
    const membership = await createTestMembership(
      prisma,
      user.id,
      business.id,
      role,
    );
    createdIds.userIds.push(user.id);
    createdIds.businessIds.push(business.id);
    createdIds.membershipIds.push(membership.id);
    return { user, business };
  }

  describe.each([
    ['OWNER', MembershipRole.OWNER],
    ['ADMIN', MembershipRole.ADMIN],
  ] as const)('%s en negocio LEGACY', (_label, role) => {
    it('GET /customers abre Clientes LEGACY (200), nunca 401/403', async () => {
      const { user, business } = await setupLegacyBusiness(role);
      const headers = {
        'x-business-id': business.id,
        'x-test-user-id': user.id,
      };

      await request(app.getHttpServer())
        .get('/customers')
        .set(headers)
        .expect(200);
    });

    it('GET /businesses/current confirma experienceVersion LEGACY (200)', async () => {
      const { user, business } = await setupLegacyBusiness(role);
      const headers = {
        'x-business-id': business.id,
        'x-test-user-id': user.id,
      };

      const res = await request(app.getHttpServer())
        .get('/businesses/current')
        .set(headers)
        .expect(200);

      expect(res.body.experienceVersion).toBe('LEGACY');
      expect(res.body.onboardingCompletedAt).toBeNull();
    });

    it('GET /onboarding/state NUNCA trata al negocio LEGACY como un draft — la causa real del bug', async () => {
      const { user } = await setupLegacyBusiness(role);

      const res = await request(app.getHttpServer())
        .get('/onboarding/state')
        .set({ 'x-test-user-id': user.id })
        .expect(200);

      // Antes del fix esto devolvía el id del negocio LEGACY como si fuera
      // un borrador en curso, y eso era lo que disparaba el redirect a
      // `/comenzar` en cada navegación del panel.
      expect(res.body.businessId).toBeNull();
    });
  });

  describe('401 vs 403/500 — solo sesión inválida puede terminar en /login', () => {
    it('sin token real (Authorization ausente): 401 — caso legítimo de sesión inválida', async () => {
      // Bootea su PROPIO módulo con el JwtGuard REAL (sin el fake), para
      // probar passport-jwt de verdad, no el mock que usa el resto de esta
      // suite.
      const realModule: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const realApp = realModule.createNestApplication();
      await realApp.init();

      await request(realApp.getHttpServer()).get('/customers').expect(401);

      await realApp.close();
    });

    it('tenant equivocado (sin membership en ese negocio): 403, no 401', async () => {
      const { user } = await setupLegacyBusiness(MembershipRole.OWNER);
      const otherBusiness = await createTestBusiness(
        prisma,
        `${makeTestSuffix()}-other`,
      );
      createdIds.businessIds.push(otherBusiness.id);

      await request(app.getHttpServer())
        .get('/customers')
        .set({ 'x-business-id': otherBusiness.id, 'x-test-user-id': user.id })
        .expect(403);
    });

    it('rol insuficiente (OPERATOR intentando borrar): 403, no 401', async () => {
      const { user, business } = await setupLegacyBusiness(
        MembershipRole.OPERATOR,
      );

      await request(app.getHttpServer())
        .delete('/customers/00000000-0000-0000-0000-000000000000')
        .set({ 'x-business-id': business.id, 'x-test-user-id': user.id })
        .expect(403);
    });
  });
});
