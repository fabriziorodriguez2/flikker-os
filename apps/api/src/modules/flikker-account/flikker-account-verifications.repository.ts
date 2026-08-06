import { Injectable } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const VERIFICATION_TTL_MINUTES = 10;
export const VERIFICATION_MAX_ATTEMPTS = 5;
export const VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export interface StartResult {
  code: string | null;
  sent: boolean;
}

/**
 * Proves phone ownership before a FlikkerAccount is created or a Customer is
 * linked to one. Copies `CustomerVerificationsRepository`'s exact mechanics
 * (hashed code, 10-minute TTL, 5-attempt cap, 60s resend cooldown) rather
 * than generalizing it: that repository is keyed by `(businessId,
 * customerId)`, which does not exist yet at this point in the flow — this is
 * account-first, phone-first, and runs before any FlikkerAccount exists.
 */
@Injectable()
export class FlikkerAccountVerificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async start(phoneE164: string, now: Date = new Date()): Promise<StartResult> {
    const cooldownStart = new Date(
      now.getTime() - VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000,
    );
    const recent = await this.prisma.flikkerAccountVerification.findFirst({
      where: { phoneE164, createdAt: { gt: cooldownStart } },
      select: { id: true },
    });
    if (recent) return { code: null, sent: false };

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.flikkerAccountVerification.create({
      data: {
        phoneE164,
        codeHash: hashCode(code),
        expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60_000),
      },
    });
    return { code, sent: true };
  }

  async verify(
    phoneE164: string,
    code: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const record = await this.prisma.flikkerAccountVerification.findFirst({
      where: { phoneE164, consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true, expiresAt: true, attempts: true },
    });

    if (!record) return false;
    if (record.expiresAt <= now) return false;
    if (record.attempts >= VERIFICATION_MAX_ATTEMPTS) return false;

    const matches = record.codeHash === hashCode(code);
    if (!matches) {
      await this.prisma.flikkerAccountVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return false;
    }

    await this.prisma.flikkerAccountVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 }, consumedAt: now },
    });
    return true;
  }
}
