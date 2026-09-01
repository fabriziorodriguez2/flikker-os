import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeToE164 } from '../../common/utils/phone.util';
import {
  buildMiFlikkerLink,
  PublicMessagingService,
} from '../public/public-messaging.service';
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
  private readonly logger = new Logger(FlikkerAccountService.name);

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

  /**
   * Reclama el derecho a incluir el link de "Mi Flikker" en el welcome de
   * este registro. Devuelve el link si le toca a este registro mandarlo, o
   * `null` si ya se mandó antes (otro negocio, otra visita, un reintento).
   *
   * El `updateMany` guardado por `welcomeLinkSentAt: null` es el reclamo
   * atómico — mismo idioma que `RewardGoalUnlockService`: bajo concurrencia
   * solo uno gana, así que el mismo teléfono nunca recibe el link dos veces.
   * `getOrCreateAccount` es seguro sin OTP: solo resuelve/crea la fila por
   * teléfono, nunca vincula un `Customer` (eso sigue exigiendo OTP, ver
   * `verifyAndIssueSession`).
   *
   * IMPORTANTE: reclamar NO es haber enviado. Si el envío después falla, el
   * caller tiene que llamar a `releaseWelcomeLink` — ver ahí el porqué.
   * Best-effort: nunca tira hacia el registro de check-in.
   */
  async claimWelcomeLink(phoneE164: string): Promise<string | null> {
    try {
      const account = await this.getOrCreateAccount(phoneE164);
      const claimed = await this.prisma.flikkerAccount.updateMany({
        where: { id: account.id, welcomeLinkSentAt: null },
        data: { welcomeLinkSentAt: new Date() },
      });
      if (claimed.count === 0) return null;
      return buildMiFlikkerLink();
    } catch (error) {
      this.logger.warn(
        `Mi Flikker welcome-link claim failed for ${phoneE164}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Devuelve el reclamo cuando el envío NO salió.
   *
   * Bug real que esto cierra (caso de David García, +598 92 216 861):
   * `welcomeLinkSentAt` se marcaba ANTES de intentar el envío, así que
   * cuando el proveedor rechazaba el mensaje por rate limit la cuenta
   * quedaba marcada como "welcome enviado" para siempre y el cliente no lo
   * recibía nunca — no había reintento posible. Liberando el reclamo, el
   * próximo registro de ese mismo teléfono vuelve a intentarlo.
   */
  async releaseWelcomeLink(phoneE164: string): Promise<void> {
    try {
      await this.prisma.flikkerAccount.updateMany({
        where: { phoneE164 },
        data: { welcomeLinkSentAt: null },
      });
    } catch (error) {
      this.logger.warn(
        `Mi Flikker welcome-link release failed for ${phoneE164}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async resolveSession(rawToken: string | undefined) {
    return this.sessions.resolveLive(rawToken ?? '');
  }

  /**
   * Vuelve a aplicar el vínculo teléfono-probado → `Customer` para una cuenta
   * que YA verificó su teléfono alguna vez.
   *
   * Bug real que esto cierra (auditoría de caso real, +598 91 624 988):
   * `linkExistingCustomers` corría ÚNICAMENTE dentro de
   * `verifyAndIssueSession`, así que cualquier `Customer` creado DESPUÉS del
   * último OTP quedaba huérfano para siempre — la sesión dura 30 días, el
   * cliente nunca vuelve a verificar, y cada negocio nuevo al que se sumaba
   * se volvía invisible en "Mis lugares y premios". En el caso real: el
   * último OTP fue el 22/08 01:09 y el Customer de Bar Fraternidad (con su
   * goal ACTIVE y 3 visitas) se creó el 22/08 16:29 — 15 horas tarde.
   *
   * NO afloja la seguridad: no linkea por un teléfono "escrito en un
   * check-in", linkea por el teléfono que ESTA cuenta ya probó por OTP, con
   * coincidencia exacta — exactamente la misma operación que
   * `verifyAndIssueSession` ya hacía, solo que también después. Best-effort:
   * si falla, Mi Flikker sigue mostrando lo que ya tenía.
   */
  async syncLinkedCustomers(flikkerAccountId: string): Promise<void> {
    try {
      const account = await this.prisma.flikkerAccount.findUnique({
        where: { id: flikkerAccountId },
        select: { phoneE164: true },
      });
      if (!account) return;
      await this.linkExistingCustomers(flikkerAccountId, account.phoneE164);
    } catch (error) {
      this.logger.warn(
        `Mi Flikker customer re-link failed for account ${flikkerAccountId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
