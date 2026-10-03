import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { CheckoutPlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { EmailService } from '../../jobs/email.service';

/**
 * Reproduce, contra Postgres real, el bug reportado en producción:
 *
 *   /signup?plan=PRO&billing=MONTHLY
 *   → verify-email (el link del correo NUNCA lleva billing/plan — solo
 *     token+email — y encima se abrió en una pestaña/navegador distinto al
 *     del signup, así que cualquier cookie del signup ya no está)
 *   → pendingUpgradePlan debe seguir siendo MONTHLY
 *
 * Antes la intención vivía en una cookie — por eso se perdía. Ahora vive en
 * el User, así que `verifyEmail` (que ni conoce ni necesita conocer el
 * plan) no puede perderla: no hay nada que viajar entre pestañas, viaja con
 * la sesión.
 */
describe('pendingUpgradePlan sobrevive signup -> verify-email (bug reproducido, Parte 5C)', () => {
  let prisma: PrismaService;
  let authService: AuthService;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-jwt-secret-pending-upgrade-plan-spec';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [AuthService, AuthRepository, PrismaService, EmailService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);
    moduleRef.get(JwtService); // sanity: se resuelve sin tirar
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cleanupUser(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  it('MONTHLY: sigue MONTHLY después de verificar el correo sin ningún query param de plan', async () => {
    const email = `pending-plan-${randomUUID().slice(0, 8)}@test.local`;
    try {
      const signupResult = (await authService.signup({
        name: 'Ana Pérez',
        email,
        password: 'password1',
        confirmPassword: 'password1',
        pendingUpgradePlan: CheckoutPlan.MONTHLY,
      })) as { _dev_token?: string };

      // Justo después del signup, ya debe estar en el User.
      const afterSignup = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { id: true, pendingUpgradePlan: true },
      });
      expect(afterSignup.pendingUpgradePlan).toBe('MONTHLY');

      // El link de verificación NUNCA lleva plan/billing — solo token+email.
      expect(signupResult._dev_token).toEqual(expect.any(String));
      await authService.verifyEmail({ token: signupResult._dev_token! });

      const afterVerify = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { pendingUpgradePlan: true },
      });
      expect(afterVerify.pendingUpgradePlan).toBe('MONTHLY');
    } finally {
      await cleanupUser(email);
    }
  });

  it('YEARLY: sigue YEARLY después de verificar el correo', async () => {
    const email = `pending-plan-${randomUUID().slice(0, 8)}@test.local`;
    try {
      const signupResult = (await authService.signup({
        name: 'Ana Pérez',
        email,
        password: 'password1',
        confirmPassword: 'password1',
        pendingUpgradePlan: CheckoutPlan.YEARLY,
      })) as { _dev_token?: string };

      await authService.verifyEmail({ token: signupResult._dev_token! });

      const afterVerify = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { pendingUpgradePlan: true },
      });
      expect(afterVerify.pendingUpgradePlan).toBe('YEARLY');
    } finally {
      await cleanupUser(email);
    }
  });

  it('signup normal (sin intención): pendingUpgradePlan null antes y después de verificar', async () => {
    const email = `pending-plan-${randomUUID().slice(0, 8)}@test.local`;
    try {
      const signupResult = (await authService.signup({
        name: 'Ana Pérez',
        email,
        password: 'password1',
        confirmPassword: 'password1',
      })) as { _dev_token?: string };

      const afterSignup = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { pendingUpgradePlan: true },
      });
      expect(afterSignup.pendingUpgradePlan).toBeNull();

      await authService.verifyEmail({ token: signupResult._dev_token! });

      const afterVerify = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { pendingUpgradePlan: true },
      });
      expect(afterVerify.pendingUpgradePlan).toBeNull();
    } finally {
      await cleanupUser(email);
    }
  });

  it('consumePendingUpgradePlan la vuelve null — y queda null para siempre, no reaparece', async () => {
    const email = `pending-plan-${randomUUID().slice(0, 8)}@test.local`;
    try {
      await authService.signup({
        name: 'Ana Pérez',
        email,
        password: 'password1',
        confirmPassword: 'password1',
        pendingUpgradePlan: CheckoutPlan.MONTHLY,
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });

      await authService.consumePendingUpgradePlan(user.id);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { pendingUpgradePlan: true },
      });
      expect(after.pendingUpgradePlan).toBeNull();
    } finally {
      await cleanupUser(email);
    }
  });
});
