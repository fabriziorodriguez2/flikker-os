import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PlansRepository } from './plans.repository';

/** Default limits when a business has no active subscription. */
const DEFAULT_LIMITS = {
  maxBranches: 1,
  maxMembers: 2,
  maxCampaigns: 1,
  maxReviewsPerMonth: 20,
  messageQuotaMonthly: 0,
};

@Injectable()
export class PlansService {
  constructor(private readonly repository: PlansRepository) {}

  findAllActive() {
    return this.repository.findAllActive();
  }

  async findBySlug(slug: string) {
    const plan = await this.repository.findBySlug(slug);
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  /**
   * Returns the plan limits for a business.
   * Falls back to DEFAULT_LIMITS if no active subscription exists.
   */
  async getLimits(businessId: string) {
    const sub = await this.repository.findActiveSubscription(businessId);

    if (
      !sub ||
      (sub.status !== SubscriptionStatus.ACTIVE &&
        sub.status !== SubscriptionStatus.TRIALING)
    ) {
      return DEFAULT_LIMITS;
    }

    return sub.plan;
  }

  /**
   * Checks if the business can add another branch.
   * Throws ForbiddenException if limit is reached.
   */
  async assertCanAddBranch(businessId: string) {
    const [limits, currentCount] = await Promise.all([
      this.getLimits(businessId),
      this.repository.countActiveBranches(businessId),
    ]);

    if (currentCount >= limits.maxBranches) {
      throw new ForbiddenException(
        `Branch limit reached (${limits.maxBranches}). Upgrade your plan.`,
      );
    }
  }

  /**
   * Checks if the business can add another member.
   * Throws ForbiddenException if limit is reached.
   */
  async assertCanAddMember(businessId: string) {
    const [limits, currentCount] = await Promise.all([
      this.getLimits(businessId),
      this.repository.countActiveMembers(businessId),
    ]);

    if (currentCount >= limits.maxMembers) {
      throw new ForbiddenException(
        `Member limit reached (${limits.maxMembers}). Upgrade your plan.`,
      );
    }
  }
}
