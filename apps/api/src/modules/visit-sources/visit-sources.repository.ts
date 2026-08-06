import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma, VisitSource, VisitSourceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isCheckinV2 } from '../../common/experience/experience.util';

export interface CreateVisitSourceData {
  name: string;
  type?: VisitSourceType;
  isDefault?: boolean;
}

export interface UpdateVisitSourceData {
  name?: string;
  type?: VisitSourceType;
  isActive?: boolean;
}

/** Opaque, URL-safe token used in the public /check-in/{token} entry. */
function generateSourceToken(): string {
  return randomBytes(16).toString('base64url');
}

@Injectable()
export class VisitSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(businessId: string) {
    return this.prisma.visitSource.findMany({
      where: { businessId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findOne(businessId: string, id: string) {
    return this.prisma.visitSource.findFirst({ where: { id, businessId } });
  }

  /** Rollout check used before any lazy creation of V2 rows. */
  async isCheckinV2Business(businessId: string): Promise<boolean> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { experienceVersion: true },
    });
    return isCheckinV2(business);
  }

  /** Public resolution by opaque token — includes the owning business. */
  /**
   * Public resolution by opaque token — includes the owning business's rollout
   * flag so callers can reject a legacy business without a second query.
   */
  findByToken(token: string) {
    return this.prisma.visitSource.findUnique({
      where: { token },
      include: {
        business: {
          select: { id: true, isActive: true, experienceVersion: true },
        },
      },
    });
  }

  async create(businessId: string, data: CreateVisitSourceData) {
    return this.prisma.visitSource.create({
      data: {
        businessId,
        name: data.name,
        type: data.type ?? VisitSourceType.qr,
        isDefault: data.isDefault ?? false,
        token: generateSourceToken(),
      },
    });
  }

  /** Scoped update. Returns null when the source does not belong to the tenant. */
  async update(businessId: string, id: string, data: UpdateVisitSourceData) {
    const existing = await this.prisma.visitSource.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!existing) return null;
    return this.prisma.visitSource.update({ where: { id }, data });
  }

  async remove(businessId: string, id: string) {
    const result = await this.prisma.visitSource.deleteMany({
      where: { id, businessId },
    });
    return result.count > 0;
  }

  countVisits(businessId: string, sourceId: string): Promise<number> {
    return this.prisma.visit.count({ where: { businessId, sourceId } });
  }

  /** Increments the per-source scan counter (aggregate metric for the panel). */
  bumpScan(id: string) {
    return this.prisma.visitSource.update({
      where: { id },
      data: { scannedCount: { increment: 1 }, lastScannedAt: new Date() },
    });
  }

  /**
   * Idempotent default-source backfill for a single business. Safe under
   * concurrency: the partial unique index (one default per business) turns a
   * racing second insert into a P2002 we recover from by re-reading.
   */
  async ensureDefaultSource(businessId: string): Promise<VisitSource> {
    const existing = await this.prisma.visitSource.findFirst({
      where: { businessId, isDefault: true },
    });
    if (existing) return existing;

    try {
      return await this.prisma.visitSource.create({
        data: {
          businessId,
          name: 'Principal',
          type: VisitSourceType.qr,
          isDefault: true,
          token: generateSourceToken(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.visitSource.findFirst({
          where: { businessId, isDefault: true },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }
}
