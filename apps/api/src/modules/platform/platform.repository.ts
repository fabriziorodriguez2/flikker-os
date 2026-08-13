import { Injectable } from '@nestjs/common';
import {
  BusinessPlanType,
  BusinessStatus,
  ExperienceVersion,
  MembershipRole,
  MembershipStatus,
  MessageChannel,
  MessageStatus,
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
export class PlatformRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all businesses with aggregated stats for the platform admin panel.
   */
  async findAllBusinesses() {
    return this.prisma.business.findMany({
      where: { status: { not: BusinessStatus.ARCHIVED } },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        status: true,
        industry: true,
        country: true,
        createdAt: true,
        experienceVersion: true,
        retentionEngineV2Enabled: true,
        subscription: {
          select: {
            status: true,
            plan: { select: { name: true, slug: true } },
          },
        },
        _count: {
          select: {
            branches: true,
            memberships: true,
            customers: { where: { isActive: true } },
            googleReviews: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findBusinessById(businessId: string) {
    return this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
      },
    });
  }

  async createBusinessWithOwner(input: {
    name: string;
    legalName?: string;
    vertical?: string;
    country: string;
    timezone: string;
    phone?: string;
    ownerEmail: string;
    ownerFirstName: string;
    ownerLastName: string;
    passwordHash: string;
    experienceVersion?: ExperienceVersion;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const slug = await this.buildUniqueSlug(input.name);
      let owner = await tx.user.findUnique({
        where: { email: input.ownerEmail },
      });
      const reusedOwnerUser = Boolean(owner);

      if (!owner) {
        owner = await tx.user.create({
          data: {
            email: input.ownerEmail,
            passwordHash: input.passwordHash,
            firstName: input.ownerFirstName,
            lastName: input.ownerLastName,
            isActive: true,
          },
        });
      }

      const business = await tx.business.create({
        data: {
          name: input.name,
          legalName: input.legalName,
          slug,
          status: BusinessStatus.ONBOARDING,
          vertical: input.vertical,
          country: input.country,
          timezone: input.timezone,
          currency: 'USD',
          phone: input.phone,
          messageQuotaMonthly: 600,
          messageCountCurrentMonth: 0,
          // El alta la hace Platform Admin, no el dueño: este negocio no pasa
          // por /comenzar. Se marca completo para que el guard del panel no
          // mande a su OWNER al onboarding self-service.
          onboardingCompletedAt: new Date(),
          // Falls back to the schema default (LEGACY) when not supplied.
          ...(input.experienceVersion
            ? { experienceVersion: input.experienceVersion }
            : {}),
        },
      });

      await tx.membership.create({
        data: {
          userId: owner.id,
          businessId: business.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
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

      return { business, owner, reusedOwnerUser };
    });
  }

  findOnboardingBusiness(businessId: string) {
    return this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        vertical: true,
        timezone: true,
        phone: true,
        logoUrl: true,
        country: true,
        googlePlaceId: true,
        googleReviewsLastSyncAt: true,
        googleBusinessProfileUrl: true,
        defaultReviewRedirectUrl: true,
      },
    });
  }

  countCustomers(businessId: string) {
    return this.prisma.customer.count({
      where: { businessId, isActive: true },
    });
  }

  updateOnboardingBusiness(
    businessId: string,
    data: {
      name?: string;
      vertical?: string | null;
      timezone?: string;
      phone?: string | null;
      logoUrl?: string | null;
    },
  ) {
    return this.prisma.business.update({
      where: { id: businessId },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        vertical: true,
        timezone: true,
        phone: true,
        logoUrl: true,
        googleReviewsLastSyncAt: true,
      },
    });
  }

  updateGoogleBusinessProfile(
    businessId: string,
    data: {
      googlePlaceId: string;
      googleBusinessProfileUrl: string;
      defaultReviewRedirectUrl: string;
    },
  ) {
    return this.prisma.business.update({
      where: { id: businessId },
      data: {
        ...data,
        googleReviewsLastSyncAt: null,
      },
      select: {
        id: true,
        googlePlaceId: true,
        googleReviewsLastSyncAt: true,
        googleBusinessProfileUrl: true,
        defaultReviewRedirectUrl: true,
      },
    });
  }

  async createOnboardingTestMessage(input: {
    businessId: string;
    customerName: string;
    phoneE164: string;
    trackingToken: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const existingCustomer = await tx.customer.findFirst({
        where: {
          businessId: input.businessId,
          phoneE164: input.phoneE164,
        },
      });
      const customer = existingCustomer
        ? await tx.customer.update({
            where: { id: existingCustomer.id },
            data: { name: input.customerName },
          })
        : await tx.customer.create({
            data: {
              businessId: input.businessId,
              name: input.customerName,
              phoneE164: input.phoneE164,
            },
          });

      const message = await tx.message.create({
        data: {
          businessId: input.businessId,
          customerId: customer.id,
          channel: MessageChannel.whatsapp,
          trackingToken: input.trackingToken,
          status: MessageStatus.queued,
        },
      });

      return { customer, message };
    });
  }

  markMessageSent(messageId: string, whatsappMsgId: string) {
    return this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.sent,
        sentAt: new Date(),
        whatsappMsgId,
      },
    });
  }

  markMessageFailed(messageId: string) {
    return this.prisma.message.update({
      where: { id: messageId },
      data: { status: MessageStatus.failed },
    });
  }

  activateBusiness(businessId: string) {
    return this.prisma.business.update({
      where: { id: businessId },
      data: {
        status: BusinessStatus.ACTIVE,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        isActive: true,
      },
    });
  }

  archiveBusiness(businessId: string) {
    return this.prisma.business.update({
      where: { id: businessId },
      data: {
        status: BusinessStatus.ARCHIVED,
        isActive: false,
        archivedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        isActive: true,
        archivedAt: true,
      },
    });
  }

  createImpersonationLog(adminId: string, targetBusinessId: string) {
    return this.prisma.impersonationLog.create({
      data: {
        adminId,
        targetBusinessId,
      },
    });
  }

  findAuditLogs() {
    return this.prisma.auditLog.findMany({
      take: 200,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        businessId: true,
        actorUserId: true,
        metadata: true,
        createdAt: true,
        business: {
          select: { id: true, name: true, slug: true },
        },
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  private async buildUniqueSlug(name: string) {
    const baseSlug = slugify(name);
    const existingBusinesses = await this.prisma.business.findMany({
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

    return slug;
  }

  // ── Business plans ────────────────────────────────────────────────────────

  createBusinessPlan(data: {
    businessId: string;
    plan: BusinessPlanType;
    trialGoal: number | null;
    trialStart: Date | null;
    startDate: Date;
    notes: string | null;
    createdById: string | null;
  }) {
    return this.prisma.businessPlan.create({
      data: {
        businessId: data.businessId,
        plan: data.plan,
        trialGoal: data.trialGoal,
        trialStart: data.trialStart,
        startDate: data.startDate,
        notes: data.notes,
        createdById: data.createdById,
      },
    });
  }

  findCurrentBusinessPlan(businessId: string) {
    return this.prisma.businessPlan.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findBusinessPlanHistory(businessId: string) {
    return this.prisma.businessPlan.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  // ── Onboarding reset (admin QA tool) ──────────────────────────────────────

  async resetOnboardingForBusinessOwners(businessId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        businessId,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
      select: { userId: true },
    });
    const userIds = memberships.map((m) => m.userId);
    if (userIds.length === 0) return { resetCount: 0 };

    const result = await this.prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { onboardingCompletedAt: null },
    });
    return { resetCount: result.count };
  }
}

function slugify(value: string) {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'negocio';
}
