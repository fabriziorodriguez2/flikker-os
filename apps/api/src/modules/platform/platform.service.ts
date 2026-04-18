import { Injectable } from '@nestjs/common';
import { PlatformRepository } from './platform.repository';

@Injectable()
export class PlatformService {
  constructor(private readonly repository: PlatformRepository) {}

  async listBusinesses() {
    const businesses = await this.repository.findAllBusinesses();

    return businesses.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      status: b.status,
      industry: b.industry,
      country: b.country,
      createdAt: b.createdAt,
      plan: b.subscription?.plan?.name ?? 'Free',
      planSlug: b.subscription?.plan?.slug ?? 'free',
      subscriptionStatus: b.subscription?.status ?? null,
      branchCount: b._count.branches,
      memberCount: b._count.memberships,
    }));
  }
}
