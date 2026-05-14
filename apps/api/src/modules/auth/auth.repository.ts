import { Injectable } from '@nestjs/common';
import {
  BusinessStatus,
  MembershipRole,
  MembershipStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const PRO_PLAN_DATA = {
  slug: 'pro',
  name: 'Pro',
  description: 'USD 129/mes, setup USD 99, incluye 600 mensajes WhatsApp/mes.',
  maxBranches: 10,
  maxMembers: 15,
  maxCampaigns: 20,
  maxReviewsPerMonth: 600,
  priceMonthly: 12900,
  priceUsd: 129,
  setupFeeUsd: 99,
  messageQuotaMonthly: 600,
  trialDays: 0,
  displayOrder: 2,
  isActive: true,
};

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
      },
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

  async createSignupAccount(data: {
    email: string;
    passwordHash: string;
    businessName: string;
    vertical: string;
    timezone: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const baseSlug = this.slugify(data.businessName);
      const existingBusinesses = await tx.business.findMany({
        where: { slug: { startsWith: baseSlug } },
        select: { slug: true },
      });
      const existingSlugs = new Set(
        existingBusinesses.map((business) => business.slug),
      );
      let slug = baseSlug;
      let suffix = 2;

      while (existingSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }

      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          firstName: data.businessName,
          lastName: 'Owner',
          isActive: true,
        },
      });

      const business = await tx.business.create({
        data: {
          name: data.businessName,
          slug,
          status: BusinessStatus.ACTIVE,
          vertical: data.vertical,
          country: 'UY',
          timezone: data.timezone,
          currency: 'USD',
          messageQuotaMonthly: 600,
          messageCountCurrentMonth: 0,
        },
      });

      const plan = await tx.plan.upsert({
        where: { slug: 'pro' },
        update: PRO_PLAN_DATA,
        create: PRO_PLAN_DATA,
      });

      const currentPeriodStart = new Date();
      const currentPeriodEnd = new Date(currentPeriodStart);
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

      await tx.subscription.create({
        data: {
          businessId: business.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart,
          currentPeriodEnd,
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          businessId: business.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      return { user, business };
    });
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
        business: { select: { name: true, slug: true, status: true, logoUrl: true } },
      },
    });
  }

  private slugify(value: string) {
    const slug = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'negocio';
  }
}
