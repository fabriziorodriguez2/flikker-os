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
}
