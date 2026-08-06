import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { BenefitType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Unambiguous alphabet for redemption codes (no 0/O/1/I/L) — easy to read/type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateRedemptionCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}

export type ConsumeRedemptionResult =
  | { status: 'not_found' }
  | { status: 'already' }
  | {
      status: 'ok';
      participationId: string;
      benefitId: string;
      customerId: string;
      benefitTitle: string;
      benefitType: BenefitType;
      customerName: string;
    };

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

  /** Only the currently open cycle — closed (already-drawn) entries are excluded. */
  findParticipants(businessId: string, benefitId: string) {
    return this.prisma.benefitParticipation.findMany({
      where: { benefitId, businessId, raffleDrawId: null },
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

  /**
   * Idempotent per open cycle: a customer participates at most once per
   * cycle. If their prior entry was already closed by a raffle draw, this
   * re-opens it for the new cycle instead of leaving them stuck out of it.
   */
  registerParticipation(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    return this.prisma.benefitParticipation.upsert({
      where: { benefitId_customerId: { benefitId, customerId } },
      create: { businessId, benefitId, customerId },
      update: { raffleDrawId: null, createdAt: new Date() },
    });
  }

  /**
   * Ensures the (benefit, customer) participation has a redemption code, issuing
   * one if missing. Idempotent: if a code already exists (even if redeemed) it is
   * returned unchanged. Retries on the rare code collision.
   */
  async ensureRedemptionCode(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    const existing = await this.prisma.benefitParticipation.findUnique({
      where: { benefitId_customerId: { benefitId, customerId } },
    });
    if (existing?.redemptionCode) return existing;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (existing) {
          return await this.prisma.benefitParticipation.update({
            where: { id: existing.id },
            data: { redemptionCode: generateRedemptionCode() },
          });
        }
        return await this.prisma.benefitParticipation.create({
          data: {
            businessId,
            benefitId,
            customerId,
            redemptionCode: generateRedemptionCode(),
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue; // code collision → regenerate
        }
        throw error;
      }
    }
    throw new Error('Could not allocate a unique redemption code');
  }

  findRedemption(businessId: string, benefitId: string, customerId: string) {
    return this.prisma.benefitParticipation.findFirst({
      where: { businessId, benefitId, customerId },
      select: { redemptionCode: true, redeemedAt: true },
    });
  }

  /**
   * Atomically consumes a redemption code. The double-canje guard is the
   * conditional `updateMany ... where redeemedAt IS NULL`: under concurrency the
   * row lock lets only one transaction flip it, so a code is redeemed at most
   * once. Runs in a transaction so the read + guarded update are consistent.
   */
  async consumeRedemption(
    businessId: string,
    code: string,
    userId: string,
    now: Date = new Date(),
  ): Promise<ConsumeRedemptionResult> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.benefitParticipation.findFirst({
        where: { businessId, redemptionCode: code },
        include: {
          benefit: { select: { title: true, type: true } },
          customer: { select: { name: true } },
        },
      });
      if (!found) return { status: 'not_found' };
      if (found.redeemedAt) return { status: 'already' };

      const updated = await tx.benefitParticipation.updateMany({
        where: { id: found.id, redeemedAt: null },
        data: { redeemedAt: now, redeemedByUserId: userId },
      });
      if (updated.count === 0) return { status: 'already' };

      return {
        status: 'ok',
        participationId: found.id,
        benefitId: found.benefitId,
        customerId: found.customerId,
        benefitTitle: found.benefit.title,
        benefitType: found.benefit.type,
        customerName: found.customer.name,
      };
    });
  }

  attachRedeemedVisit(participationId: string, visitId: string) {
    return this.prisma.benefitParticipation.update({
      where: { id: participationId },
      data: { redeemedVisitId: visitId },
    });
  }

  /** Most recent draw for a benefit, with the winner's basic contact info. */
  findLatestDraw(benefitId: string) {
    return this.prisma.raffleDraw.findFirst({
      where: { benefitId },
      orderBy: { drawnAt: 'desc' },
      select: {
        id: true,
        periodKey: true,
        participantsCount: true,
        drawnAt: true,
        winner: { select: { name: true, phoneE164: true } },
      },
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
