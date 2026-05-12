import { Injectable } from '@nestjs/common';
import { BusinessStatus, MessageChannel, MessageStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlatformRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all businesses with aggregated stats for the platform admin panel.
   */
  async findAllBusinesses() {
    return this.prisma.business.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        industry: true,
        country: true,
        createdAt: true,
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
      },
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
        country: true,
        googlePlaceId: true,
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
      data,
      select: {
        id: true,
        googlePlaceId: true,
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
      const customer =
        existingCustomer ??
        (await tx.customer.create({
          data: {
            businessId: input.businessId,
            name: input.customerName,
            phoneE164: input.phoneE164,
          },
        }));

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
}
