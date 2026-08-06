import { Injectable } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const VERIFICATION_TTL_MINUTES = 10;
export const VERIFICATION_MAX_ATTEMPTS = 5;
/** Minimum seconds between two code sends for the same customer (anti-spam). */
export const VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export interface StartResult {
  /** Raw 6-digit code — returned only so the caller can send it by WhatsApp. */
  code: string | null;
  /** False when a code was sent too recently (cooldown) — reuse the prior one. */
  sent: boolean;
}

@Injectable()
export class CustomerVerificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a one-time recovery code for the customer, unless one was sent very
   * recently (cooldown). Only the code hash is stored.
   */
  async start(
    businessId: string,
    customerId: string,
    now: Date = new Date(),
  ): Promise<StartResult> {
    const cooldownStart = new Date(
      now.getTime() - VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000,
    );
    const recent = await this.prisma.customerVerification.findFirst({
      where: {
        businessId,
        customerId,
        purpose: 'session_recovery',
        createdAt: { gt: cooldownStart },
      },
      select: { id: true },
    });
    if (recent) return { code: null, sent: false };

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.customerVerification.create({
      data: {
        businessId,
        customerId,
        codeHash: hashCode(code),
        purpose: 'session_recovery',
        expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60_000),
      },
    });
    return { code, sent: true };
  }

  /**
   * Verifies a recovery code against the latest live code for the customer.
   * Consumes it on success. Enforces expiry and a max-attempts cap. Returns
   * true only on a correct, unexpired, unconsumed code within the attempt cap.
   */
  async verify(
    businessId: string,
    customerId: string,
    code: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const record = await this.prisma.customerVerification.findFirst({
      where: {
        businessId,
        customerId,
        purpose: 'session_recovery',
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        codeHash: true,
        expiresAt: true,
        attempts: true,
      },
    });

    if (!record) return false;
    if (record.expiresAt <= now) return false;
    if (record.attempts >= VERIFICATION_MAX_ATTEMPTS) return false;

    const matches = record.codeHash === hashCode(code);
    if (!matches) {
      await this.prisma.customerVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return false;
    }

    await this.prisma.customerVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 }, consumedAt: now },
    });
    return true;
  }
}
