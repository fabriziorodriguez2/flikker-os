import { Injectable } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
  }

  findBySlug(slug: string) {
    return this.prisma.plan.findUnique({ where: { slug } });
  }

  /**
   * Returns the active subscription with its plan for a business.
   * Returns null if the business has no subscription.
   */
  findActiveSubscription(businessId: string) {
    return this.prisma.subscription.findUnique({
      where: { businessId },
      select: {
        id: true,
        status: true,
        plan: {
          select: {
            maxBranches: true,
            maxMembers: true,
            maxCampaigns: true,
            maxReviewsPerMonth: true,
          },
        },
      },
    });
  }

  countActiveBranches(businessId: string) {
    return this.prisma.branch.count({
      where: { businessId, isActive: true },
    });
  }

  countActiveMembers(businessId: string) {
    return this.prisma.membership.count({
      where: { businessId, status: MembershipStatus.ACTIVE },
    });
  }
}
