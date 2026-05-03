import { Injectable } from '@nestjs/common';
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
