import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/** Persistent-session lifetime. Survives browser restarts. */
export const CUSTOMER_SESSION_TTL_DAYS = 180;

export interface IssuedSession {
  /** Raw opaque token — returned ONCE, stored only as a hash. Goes in a cookie. */
  rawToken: string;
  expiresAt: Date;
}

export interface LiveSession {
  id: string;
  businessId: string;
  customerId: string;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

@Injectable()
export class CustomerSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issues a new persistent session. The raw token is returned to the caller
   * (to be set as an httpOnly cookie) and never persisted — only its SHA-256
   * hash is stored.
   */
  async issue(
    businessId: string,
    customerId: string,
    userAgent?: string | null,
    now: Date = new Date(),
  ): Promise<IssuedSession> {
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      now.getTime() + CUSTOMER_SESSION_TTL_DAYS * 86_400_000,
    );
    await this.prisma.customerSession.create({
      data: {
        businessId,
        customerId,
        tokenHash: hashToken(rawToken),
        userAgent: userAgent ?? null,
        expiresAt,
      },
    });
    return { rawToken, expiresAt };
  }

  /**
   * Resolves a live (not revoked, not expired) session by its raw token and
   * refreshes lastSeenAt. Returns null when the token is unknown/dead.
   */
  async resolveLive(
    rawToken: string,
    now: Date = new Date(),
  ): Promise<LiveSession | null> {
    if (!rawToken) return null;
    const session = await this.prisma.customerSession.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: {
        id: true,
        businessId: true,
        customerId: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= now) return null;

    await this.prisma.customerSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });

    return {
      id: session.id,
      businessId: session.businessId,
      customerId: session.customerId,
    };
  }

  /** Revokes a session by its raw token (used by "cambiar de cuenta"/logout). */
  async revoke(rawToken: string, now: Date = new Date()): Promise<void> {
    if (!rawToken) return;
    await this.prisma.customerSession.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
