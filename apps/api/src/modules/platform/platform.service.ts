import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PlatformRepository } from './platform.repository';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class PlatformService {
  constructor(
    private readonly repository: PlatformRepository,
    private readonly jwt: JwtService,
    private readonly auditService: AuditService,
  ) {}

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

  async impersonate(adminId: string, targetBusinessId: string) {
    const business = await this.repository.findBusinessById(targetBusinessId);
    if (!business) throw new NotFoundException('Business not found');

    await this.repository.createImpersonationLog(adminId, targetBusinessId);
    void this.auditService.log({
      action: 'PLATFORM_IMPERSONATION_STARTED',
      entityType: 'Business',
      entityId: targetBusinessId,
      userId: adminId,
      businessId: targetBusinessId,
      metadata: {
        targetBusinessName: business.name,
        targetBusinessSlug: business.slug,
      },
    });

    const token = this.jwt.sign(
      {
        sub: adminId,
        businessId: targetBusinessId,
        isImpersonating: true,
      },
      {
        secret: process.env.JWT_SECRET!,
        expiresIn: (process.env.JWT_IMPERSONATION_EXPIRES_IN ??
          '1h') as StringValue,
      },
    );

    return {
      accessToken: token,
      expiresInSeconds: 60 * 60,
      business,
    };
  }

  listAuditLogs() {
    return this.repository.findAuditLogs();
  }
}
