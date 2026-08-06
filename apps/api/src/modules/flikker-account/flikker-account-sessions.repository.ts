import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Session lifetime for "Mi Flikker" — deliberately shorter than the 180-day
 * business check-in session (`CUSTOMER_SESSION_TTL_DAYS`). This session
 * grants read access across every business the account touches, so a
 * narrower window is the more conservative default for a cross-tenant view.
 */
export const FLIKKER_ACCOUNT_SESSION_TTL_DAYS = 30;

export interface IssuedFlikkerAccountSession {
  rawToken: string;
  expiresAt: Date;
}

export interface LiveFlikkerAccountSession {
  id: string;
  flikkerAccountId: string;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Exact mirror of `CustomerSessionsRepository` (issue/resolveLive/revoke),
 * kept as a separate class rather than a generalization of that one: this is
 * a distinct cookie, a distinct table, and a distinct trust boundary (global
 * vs. business-scoped) — sharing code here would risk the two silently
 * drifting into meaning the same thing.
 */
@Injectable()
export class FlikkerAccountSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    flikkerAccountId: string,
    userAgent?: string | null,
    now: Date = new Date(),
  ): Promise<IssuedFlikkerAccountSession> {
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      now.getTime() + FLIKKER_ACCOUNT_SESSION_TTL_DAYS * 86_400_000,
    );
    await this.prisma.flikkerAccountSession.create({
      data: {
        flikkerAccountId,
        tokenHash: hashToken(rawToken),
        userAgent: userAgent ?? null,
        expiresAt,
      },
    });
    return { rawToken, expiresAt };
  }

  async resolveLive(
    rawToken: string,
    now: Date = new Date(),
  ): Promise<LiveFlikkerAccountSession | null> {
    if (!rawToken) return null;
    const session = await this.prisma.flikkerAccountSession.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: {
        id: true,
        flikkerAccountId: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= now) return null;

    await this.prisma.flikkerAccountSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });

    return { id: session.id, flikkerAccountId: session.flikkerAccountId };
  }

  async revoke(rawToken: string, now: Date = new Date()): Promise<void> {
    if (!rawToken) return;
    await this.prisma.flikkerAccountSession.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
