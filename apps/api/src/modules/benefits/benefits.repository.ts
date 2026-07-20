import { Injectable } from '@nestjs/common';
import { BenefitType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface BenefitData {
  type: BenefitType;
  title: string;
  description?: string | null;
  terms?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  recurrence?: string | null;
  active?: boolean;
}

@Injectable()
export class BenefitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(businessId: string) {
    return this.prisma.benefit.findMany({
      where: { businessId },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findActive(businessId: string) {
    return this.prisma.benefit.findFirst({
      where: { businessId, active: true },
    });
  }

  findOne(businessId: string, id: string) {
    return this.prisma.benefit.findFirst({ where: { id, businessId } });
  }

  async create(businessId: string, data: BenefitData) {
    const makeActive = data.active ?? false;
    return this.prisma.$transaction(async (tx) => {
      if (makeActive) await this.deactivateAll(tx, businessId);
      return tx.benefit.create({
        data: {
          businessId,
          type: data.type,
          title: data.title,
          description: data.description ?? null,
          terms: data.terms ?? null,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
          recurrence: data.recurrence ?? null,
          active: makeActive,
        },
      });
    });
  }

  /** Scoped update. Returns null when the benefit does not belong to the tenant. */
  async update(businessId: string, id: string, data: Partial<BenefitData>) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.benefit.findFirst({
        where: { id, businessId },
        select: { id: true },
      });
      if (!existing) return null;

      if (data.active === true) await this.deactivateAll(tx, businessId, id);

      return tx.benefit.update({ where: { id }, data });
    });
  }

  /** Activate/deactivate. Returns null when not found for the tenant. */
  async setActive(businessId: string, id: string, active: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.benefit.findFirst({
        where: { id, businessId },
        select: { id: true },
      });
      if (!existing) return null;

      if (active) await this.deactivateAll(tx, businessId, id);

      return tx.benefit.update({ where: { id }, data: { active } });
    });
  }

  async remove(businessId: string, id: string) {
    const result = await this.prisma.benefit.deleteMany({
      where: { id, businessId },
    });
    return result.count > 0;
  }

  findParticipants(businessId: string, benefitId: string) {
    return this.prisma.benefitParticipation.findMany({
      where: { benefitId, businessId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        customer: {
          select: { id: true, name: true, phoneE164: true, email: true },
        },
      },
    });
  }

  /** Idempotent: a customer participates in a benefit at most once. */
  registerParticipation(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    return this.prisma.benefitParticipation.upsert({
      where: { benefitId_customerId: { benefitId, customerId } },
      create: { businessId, benefitId, customerId },
      update: {},
    });
  }

  private deactivateAll(
    tx: Prisma.TransactionClient,
    businessId: string,
    exceptId?: string,
  ) {
    return tx.benefit.updateMany({
      where: {
        businessId,
        active: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { active: false },
    });
  }
}
