import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BranchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByBusiness(businessId: string, includeInactive = false) {
    return this.prisma.branch.findMany({
      where: { businessId, ...(includeInactive  {} : { isActive: true }) },
      orderBy: { createdAt: 'asc' },
    });
  }

  findOne(businessId: string, branchId: string) {
    return this.prisma.branch.findFirst({
      where: { id: branchId, businessId },
    });
  }

  findBySlugInBusiness(businessId: string, slug: string) {
    return this.prisma.branch.findUnique({
      where: { businessId_slug: { businessId, slug } },
    });
  }

  /**
   * Creates a branch atomically: checks plan limit + slug uniqueness + insert
   * all inside one transaction to prevent TOCTOU race conditions.
   * Returns 'LIMIT_REACHED' | 'SLUG_TAKEN' | Branch.
   */
  async createAtomic(
    businessId: string,
    data: {
      name: string;
      slug: string;
      address?: string;
      city?: string;
      state?: string;
      phone?: string;
      email?: string;
    },
    maxBranches: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const currentCount = await tx.branch.count({
        where: { businessId, isActive: true },
      });
      if (currentCount >= maxBranches) return 'LIMIT_REACHED' as const;

      const existing = await tx.branch.findUnique({
        where: { businessId_slug: { businessId, slug: data.slug } },
      });
      if (existing) return 'SLUG_TAKEN' as const;

      return tx.branch.create({ data: { businessId, ...data } });
    });
  }

  update(
    businessId: string,
    branchId: string,
    data: {
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      phone?: string;
      email?: string;
      isActive?: boolean;
    },
  ) {
    return this.prisma.branch.updateMany({
      where: { id: branchId, businessId },
      data,
    });
  }
}
