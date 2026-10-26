import { Injectable } from '@nestjs/common';
import { CheckoutLeadStatus, CheckoutPlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** Identidad estable de Google — siempre se busca por acá ANTES que por email. */
  findUserByGoogleSub(googleSub: string) {
    return this.prisma.user.findUnique({ where: { googleSub } });
  }

  /**
   * Alta vía "Continuar con Google": el correo ya viene verificado por
   * Google (`email_verified`), así que nace con `emailVerifiedAt` y sin
   * password. Igual que el signup tradicional, NO crea Business.
   */
  createGoogleUser(data: {
    email: string;
    googleSub: string;
    firstName: string;
    lastName: string;
    pendingUpgradePlan?: CheckoutPlan | null;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        googleSub: data.googleSub,
        passwordHash: null,
        firstName: data.firstName,
        lastName: data.lastName,
        isActive: true,
        emailVerifiedAt: new Date(),
        pendingUpgradePlan: data.pendingUpgradePlan ?? null,
      },
    });
  }

  /**
   * Asocia la identidad Google a un User existente. Condicional a
   * `googleSub: null` para que dos callbacks concurrentes (o un User que ya
   * tiene OTRA identidad Google) nunca pisen un link existente: `count === 0`
   * significa "no se linkeó".
   *
   * `discardUnverifiedPassword`: una cuenta que nunca confirmó el correo no
   * probó ser de quien es dueño del email — su password pudo haberla puesto
   * cualquiera (pre-hijacking). Al probar Google la propiedad del email, esa
   * password se descarta en vez de quedar como puerta trasera.
   */
  linkGoogleSub(
    userId: string,
    googleSub: string,
    opts: { discardUnverifiedPassword: boolean },
  ) {
    return this.prisma.user.updateMany({
      where: { id: userId, googleSub: null },
      data: {
        googleSub,
        ...(opts.discardUnverifiedPassword
          ? { emailVerifiedAt: new Date(), passwordHash: null }
          : {}),
      },
    });
  }

  /** Nunca pisa una intención ya guardada. */
  setPendingUpgradePlanIfEmpty(userId: string, plan: CheckoutPlan) {
    return this.prisma.user.updateMany({
      where: { id: userId, pendingUpgradePlan: null },
      data: { pendingUpgradePlan: plan },
    });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        onboardingCompletedAt: true,
        pendingUpgradePlan: true,
        emailVerifiedAt: true,
        notificationWhatsapp: true,
      },
    });
  }

  /** Guarda el WhatsApp YA normalizado a E.164 — ver `normalizeToE164` en el servicio. */
  updateNotificationWhatsapp(id: string, phoneE164: string) {
    return this.prisma.user.update({
      where: { id },
      data: { notificationWhatsapp: phoneE164 },
      select: { id: true, notificationWhatsapp: true },
    });
  }

  /**
   * Checkout pre-onboarding (Parte 5D): el mismo "¿ya hay uno en curso?"
   * que `BusinessesRepository.findInProgressCheckoutLead`, pero sin
   * `businessId` todavía — ligado solo al User.
   */
  findInProgressPreOnboardingCheckoutLead(userId: string, plan: CheckoutPlan) {
    return this.prisma.checkoutLead.findFirst({
      where: {
        requestedByUserId: userId,
        businessId: null,
        plan,
        status: {
          notIn: [
            CheckoutLeadStatus.PAID,
            CheckoutLeadStatus.FAILED,
            CheckoutLeadStatus.EXPIRED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
  }

  createPreOnboardingCheckoutLead(input: {
    requestedByUserId: string;
    email: string;
    plan: CheckoutPlan;
  }) {
    return this.prisma.checkoutLead.create({
      data: {
        requestedByUserId: input.requestedByUserId,
        businessId: null,
        email: input.email,
        plan: input.plan,
        status: CheckoutLeadStatus.PENDING,
      },
      select: { id: true },
    });
  }

  /** El checkout pre-onboarding más reciente de este User, si hay alguno. */
  findLatestPreOnboardingCheckoutLead(userId: string) {
    return this.prisma.checkoutLead.findFirst({
      where: { requestedByUserId: userId, businessId: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        plan: true,
        businessId: true,
        providerSubscriptionId: true,
      },
    });
  }

  /**
   * Por id exacto, SIN filtrar por `businessId: null` — a diferencia de
   * `findLatestPreOnboardingCheckoutLead`. La usa `getStatus` para releer
   * después de reconciliar: si en el medio el onboarding ya asoció este
   * lead a un Business (carrera real, aunque rarísima), el filtro de
   * "pre-onboarding" ya no lo encontraría y se devolvería un estado viejo.
   */
  findCheckoutLeadById(id: string) {
    return this.prisma.checkoutLead.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        plan: true,
        businessId: true,
        providerSubscriptionId: true,
      },
    });
  }

  /** Password hash of a user — only for verifying their current password. */
  findUserCredentials(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, passwordHash: true, isActive: true },
    });
  }

  /**
   * Sets a new password and revokes every active session, matching what
   * `executePasswordReset` already does for the reset-by-token flow.
   */
  updatePasswordAndRevokeSessions(userId: string, passwordHash: string) {
    return this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  markUserOnboardingComplete(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { onboardingCompletedAt: new Date() },
      select: { id: true, onboardingCompletedAt: true },
    });
  }

  findUserActiveStatus(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { isActive: true },
    });
  }

  createSession(data: {
    userId: string;
    refreshTokenHash: string;
    userAgent?: string | null;
    ip?: string | null;
    expiresAt: Date;
  }) {
    return this.prisma.session.create({ data });
  }

  /**
   * Alta self-service: crea SOLO el usuario, sin negocio. `emailVerifiedAt`
   * arranca en null — el negocio se crea recién en `/comenzar` (paso 1,
   * `OnboardingService.saveBusiness`) una vez confirmado el correo, así que
   * una cuenta nunca verificada no deja un `Business` huérfano.
   */
  createUnverifiedUser(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    /** Intención de upgrade de `/signup?plan=PRO&billing=...` — NUNCA activa Pro. */
    pendingUpgradePlan?: CheckoutPlan | null;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        isActive: true,
        emailVerifiedAt: null,
        pendingUpgradePlan: data.pendingUpgradePlan ?? null,
      },
    });
  }

  /**
   * Consume la intención de upgrade — se llama una vez que el frontend ya
   * conoce el estado real del plan (Free u ya-Pro) y decidió qué hacer con
   * ella (abrir el modal, o simplemente descartarla si ya es Pro). Nunca se
   * llama antes de esa confirmación.
   */
  clearPendingUpgradePlan(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { pendingUpgradePlan: null },
      select: { id: true, pendingUpgradePlan: true },
    });
  }

  createEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    return this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findEmailVerificationToken(tokenHash: string) {
    return this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            emailVerifiedAt: true,
            pendingUpgradePlan: true,
          },
        },
      },
    });
  }

  /**
   * Atómico: marca el correo verificado y consume el token. No pisa
   * `emailVerifiedAt` si ya estaba seteado (reenvíos/dobles clics no deberían
   * poder "desverificar" ni pisar una fecha anterior).
   */
  executeEmailVerification(userId: string, tokenId: string) {
    return this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: tokenId },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  findActiveSession(userId: string, refreshTokenHash: string) {
    return this.prisma.session.findFirst({
      where: {
        userId,
        refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  revokeSessionByTokenHash(refreshTokenHash: string) {
    return this.prisma.session.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Atomically revokes old session and creates a new one (token rotation).
   */
  rotateSession(
    oldSessionId: string,
    newSession: {
      userId: string;
      refreshTokenHash: string;
      userAgent: string | null;
      ip: string | null;
      expiresAt: Date;
    },
  ) {
    return this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: oldSessionId },
        data: { revokedAt: new Date() },
      }),
      this.prisma.session.create({ data: newSession }),
    ]);
  }

  createResetToken(userId: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findResetToken(tokenHash: string) {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { email: true } } },
    });
  }

  /**
   * Atomically: update password, mark token used, revoke all sessions.
   */
  executePasswordReset(
    userId: string,
    passwordHash: string,
    resetTokenId: string,
  ) {
    return this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetTokenId },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  findMembershipsForUser(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        businessId: true,
        role: true,
        business: { select: { name: true, slug: true, logoUrl: true } },
      },
    });
  }

  findMembershipsWithStatus(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        businessId: true,
        role: true,
        business: {
          select: { name: true, slug: true, status: true, logoUrl: true },
        },
      },
    });
  }
}
