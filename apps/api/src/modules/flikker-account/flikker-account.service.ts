import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { PublicMessagingService } from '../public/public-messaging.service';
import { FlikkerAccountVerificationsRepository } from './flikker-account-verifications.repository';
import {
  FlikkerAccountSessionsRepository,
  type IssuedFlikkerAccountSession,
} from './flikker-account-sessions.repository';

/**
 * The global identity behind "Mi Flikker" (Fase E §3/§21).
 *
 * The one rule everything here protects: a `Customer` is only ever linked to
 * a `FlikkerAccount` after its phone has been proven by OTP — never from a
 * phone merely typed into a registration form. See the schema comment on
 * `FlikkerAccount` for why: anyone can type anyone else's number, and
 * trusting that would let one person's visits/rewards leak into a stranger's
 * global account.
 */
@Injectable()
export class FlikkerAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifications: FlikkerAccountVerificationsRepository,
    private readonly sessions: FlikkerAccountSessionsRepository,
    private readonly messaging: PublicMessagingService,
  ) {}

  /**
   * Always responds `{ sent: true }` regardless of whether the phone has ever
   * been seen — same anti-enumeration posture as the existing check-in
   * recovery flow (`CheckinService.recoverStart`). A brand-new phone can
   * still verify: verifying is what MAKES the account exist, it does not
   * require one to exist first.
   */
  async startVerification(phone: string): Promise<{ sent: true }> {
    const phoneE164 = this.parsePhone(phone);
    const { code } = await this.verifications.start(phoneE164);
    if (code) {
      void this.messaging.sendVerificationCode(phoneE164, 'Flikker', code);
    }
    return { sent: true };
  }

  /**
   * Verifies the code and, on success:
   *   1. gets or creates the FlikkerAccount for this now-proven phone;
   *   2. links every existing Customer row with that EXACT phone that isn't
   *      linked yet, across every business — safe only because ownership was
   *      just proven, and only ever matching an exact phone, never a guess;
   *   3. issues a new global session.
   */
  async verifyAndIssueSession(
    phone: string,
    code: string,
    userAgent?: string | null,
  ): Promise<IssuedFlikkerAccountSession & { flikkerAccountId: string }> {
    const phoneE164 = this.parsePhone(phone);
    const ok = await this.verifications.verify(phoneE164, code);
    if (!ok) throw new UnauthorizedException('Código inválido');

    const account = await this.getOrCreateAccount(phoneE164);
    await this.linkExistingCustomers(account.id, phoneE164);

    const session = await this.sessions.issue(account.id, userAgent);
    return { ...session, flikkerAccountId: account.id };
  }

  async resolveSession(rawToken: string | undefined) {
    return this.sessions.resolveLive(rawToken ?? '');
  }

  async logout(rawToken: string | undefined) {
    if (rawToken) await this.sessions.revoke(rawToken);
    return { ok: true as const };
  }

  private parsePhone(phone: string): string {
    try {
      return normalizeToE164(phone);
    } catch {
      throw new BadRequestException('Número de teléfono inválido');
    }
  }

  private async getOrCreateAccount(phoneE164: string) {
    const existing = await this.prisma.flikkerAccount.findUnique({
      where: { phoneE164 },
      select: { id: true },
    });
    if (existing) return existing;

    try {
      return await this.prisma.flikkerAccount.create({
        data: { phoneE164 },
        select: { id: true },
      });
    } catch (error) {
      // Concurrent verification from two devices racing to create the same
      // account — the unique constraint on phoneE164 is the backstop.
      const raced = await this.prisma.flikkerAccount.findUnique({
        where: { phoneE164 },
        select: { id: true },
      });
      if (raced) return raced;
      throw error;
    }
  }

  private linkExistingCustomers(flikkerAccountId: string, phoneE164: string) {
    return this.prisma.customer.updateMany({
      where: { phoneE164, flikkerAccountId: null },
      data: { flikkerAccountId },
    });
  }
}
