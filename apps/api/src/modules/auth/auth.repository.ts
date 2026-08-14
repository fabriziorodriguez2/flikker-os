import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
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
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        isActive: true,
        emailVerifiedAt: null,
      },
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
