import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { StringValue } from 'ms';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EmailService } from '../../jobs/email.service';
import { normalizeEmail } from '../../common/utils/email.util';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_EXPIRY_MINUTES = 30;
const PASSWORD_RESET_MESSAGE = 'Email enviado';
const EMAIL_VERIFICATION_EXPIRY_HOURS = 48;
const VERIFICATION_SENT_MESSAGE = 'Revisá tu correo';
const RESEND_VERIFICATION_MESSAGE =
  'Si el correo existe y no fue confirmado, te reenviamos el enlace';

/**
 * How long a refresh session stays usable without activity. The window slides:
 * every refresh rotates the token and pushes the expiry forward, so an owner
 * who keeps using Flikker stays logged in indefinitely, while an abandoned or
 * stolen token still dies on its own. Must stay aligned with
 * JWT_REFRESH_EXPIRES_IN — the JWT is verified before the DB row is looked up.
 */
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 90);

function buildSessionExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Alta self-service. Crea SOLO el usuario (sin negocio: ver
   * `AuthRepository.createUnverifiedUser`) y le manda un correo de
   * confirmación. No devuelve tokens ni arranca sesión — eso pasa recién en
   * `verifyEmail`, cuando el dueño confirma que el correo es suyo.
   *
   * `email` único a nivel de base es lo que evita que un doble clic o un
   * refresh cree dos cuentas: el segundo intento choca contra la constraint y
   * termina en `ConflictException`, nunca en un segundo `User`.
   */
  async signup(dto: SignupDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Las contraseñas no coinciden');
    }

    const email = normalizeEmail(dto.email);
    const existingUser = await this.repository.findUserByEmail(email);

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const [firstName, ...rest] = dto.name.trim().split(/\s+/);

    const user = await this.repository.createUnverifiedUser({
      email,
      passwordHash,
      firstName: firstName || dto.name.trim(),
      lastName: rest.join(' '),
    });

    const devToken = await this.sendVerificationEmail(user);

    if (process.env.NODE_ENV !== 'production') {
      return {
        message: VERIFICATION_SENT_MESSAGE,
        email,
        _dev_token: devToken,
      };
    }
    return { message: VERIFICATION_SENT_MESSAGE, email };
  }

  /**
   * Confirma el correo, consume el token y arranca una sesión real — es el
   * único punto donde una cuenta recién creada pasa a poder usar el producto.
   * Mismo mensaje genérico para token inexistente, ya usado o vencido: no hay
   * forma de distinguir esos tres casos desde afuera.
   */
  async verifyEmail(dto: VerifyEmailDto, userAgent?: string, ip?: string) {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.repository.findEmailVerificationToken(tokenHash);

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }

    await this.repository.executeEmailVerification(record.userId, record.id);

    const { accessToken, refreshToken, refreshTokenHash } = this.generateTokens(
      record.userId,
    );
    const expiresAt = buildSessionExpiry();
    await this.repository.createSession({
      userId: record.userId,
      refreshTokenHash,
      userAgent: userAgent ?? null,
      ip: ip ?? null,
      expiresAt,
    });

    const memberships = await this.repository.findMembershipsForUser(
      record.userId,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: record.userId,
        email: record.user.email,
        firstName: record.user.firstName,
      },
      memberships,
    };
  }

  /**
   * Reenvío idempotente: SIEMPRE el mismo mensaje genérico, exista o no la
   * cuenta, esté verificada o no — nunca revela cuál de los tres casos fue.
   * Solo manda un correo (y crea un token nuevo) si hay algo real que
   * confirmar.
   */
  async resendVerification(dto: ResendVerificationDto) {
    const email = normalizeEmail(dto.email);
    const user = await this.repository.findUserByEmail(email);

    if (!user || !user.isActive || user.emailVerifiedAt) {
      return { message: RESEND_VERIFICATION_MESSAGE };
    }

    const devToken = await this.sendVerificationEmail(user);

    if (process.env.NODE_ENV !== 'production') {
      return { message: RESEND_VERIFICATION_MESSAGE, _dev_token: devToken };
    }
    return { message: RESEND_VERIFICATION_MESSAGE };
  }

  async login(dto: LoginDto, userAgent?: string, ip?: string) {
    const user = await this.repository.findUserByEmail(
      normalizeEmail(dto.email),
    );

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Recién acá, DESPUÉS de validar la contraseña: revelar "correo sin
    // confirmar" antes de comprobar la contraseña sería un oráculo de
    // enumeración (alguien podría probar emails al voleo para saber cuáles
    // existen). Con la contraseña ya validada, quien lo ve ya demostró ser
    // el dueño de la cuenta.
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Confirmá tu correo antes de ingresar. Revisá tu bandeja de entrada.',
      );
    }

    const { accessToken, refreshToken, refreshTokenHash } = this.generateTokens(
      user.id,
    );

    const expiresAt = buildSessionExpiry();

    await this.repository.createSession({
      userId: user.id,
      refreshTokenHash,
      userAgent: userAgent ?? null,
      ip: ip ?? null,
      expiresAt,
    });

    const memberships = await this.repository.findMembershipsForUser(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      memberships,
    };
  }

  async refresh(dto: RefreshDto) {
    let payload: { sub: string };
    try {
      payload = this.jwt.verify(dto.refreshToken, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const refreshTokenHash = this.hashToken(dto.refreshToken);

    const session = await this.repository.findActiveSession(
      payload.sub,
      refreshTokenHash,
    );

    if (!session) {
      throw new UnauthorizedException('Session not found or expired');
    }

    const user = await this.repository.findUserActiveStatus(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    // Rotate: revoke old session, create new one
    const {
      accessToken,
      refreshToken,
      refreshTokenHash: newHash,
    } = this.generateTokens(payload.sub);

    const expiresAt = buildSessionExpiry();

    await this.repository.rotateSession(session.id, {
      userId: payload.sub,
      refreshTokenHash: newHash,
      userAgent: session.userAgent,
      ip: session.ip,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  async logout(dto: LogoutDto) {
    const refreshTokenHash = this.hashToken(dto.refreshToken);
    await this.repository.revokeSessionByTokenHash(refreshTokenHash);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = normalizeEmail(dto.email);
    const user = await this.repository.findUserByEmail(email);

    // Always return 200 to avoid email enumeration
    if (!user || !user.isActive) {
      this.logger.warn(
        `Password reset requested for unknown or inactive email: ${email}`,
      );
      return { message: PASSWORD_RESET_MESSAGE };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + RESET_TOKEN_EXPIRY_MINUTES);

    await this.repository.createResetToken(user.id, tokenHash, expiresAt);

    // Token only: the email is PII and would leak into browser history, server
    // logs and Referer headers. The token already identifies the account.
    const resetUrl = `${getAppPublicUrl()}/reset-password?token=${encodeURIComponent(
      rawToken,
    )}`;

    try {
      await this.emailService.send({
        to: user.email,
        subject: 'Recuperá tu contraseña de Flikker',
        html: buildPasswordResetEmail({
          firstName: user.firstName,
          resetUrl,
          expiresInMinutes: RESET_TOKEN_EXPIRY_MINUTES,
        }),
      });
      this.logger.log(`Password reset email sent to ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Password reset email failed for ${user.email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      return { message: PASSWORD_RESET_MESSAGE, _dev_token: rawToken };
    }

    return { message: PASSWORD_RESET_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);

    const resetToken = await this.repository.findResetToken(tokenHash);

    // One single generic error for unknown / already-used / expired tokens, so
    // the response never reveals which of the three it was.
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }
    // Legacy links still carry the email; when present it must match the
    // token's owner. New links send the token only.
    if (
      dto.email !== undefined &&
      resetToken.user.email.toLowerCase() !== normalizeEmail(dto.email)
    ) {
      throw new BadRequestException('Invalid or expired token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.repository.executePasswordReset(
      resetToken.userId,
      passwordHash,
      resetToken.id,
    );

    return { message: 'Password updated successfully' };
  }

  /**
   * Self-service password change for a logged-in user. The user picks their own
   * password — nothing is generated. Requires the current password so a stolen
   * session cannot lock the owner out, and revokes every session afterwards
   * (same policy as the reset-by-token flow), so the user re-logs in.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.repository.findUserCredentials(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    const currentValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentValid) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }

    const sameAsCurrent = await bcrypt.compare(
      dto.newPassword,
      user.passwordHash,
    );
    if (sameAsCurrent) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta de la actual',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.repository.updatePasswordAndRevokeSessions(userId, passwordHash);

    this.logger.log(`Password changed by user ${userId}`);

    return { message: 'Password updated successfully' };
  }

  async me(userId: string) {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new NotFoundException();
    return user;
  }

  async memberships(userId: string) {
    return this.repository.findMembershipsWithStatus(userId);
  }

  async markOnboardingComplete(userId: string) {
    return this.repository.markUserOnboardingComplete(userId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateTokens(userId: string) {
    const payload = { sub: userId };
    const secret = process.env.JWT_SECRET!;

    const accessToken = this.jwt.sign(payload, {
      secret,
      expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as StringValue,
    });

    const refreshToken = this.jwt.sign(payload, {
      secret,
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ??
        `${SESSION_TTL_DAYS}d`) as StringValue,
    });

    const refreshTokenHash = this.hashToken(refreshToken);
    return { accessToken, refreshToken, refreshTokenHash };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Genera el token, lo persiste y manda el correo. Reusada por `signup` y
   * `resendVerification` — un solo lugar que arma el link y decide qué pasa
   * si el envío falla (se loguea, no revienta el request: igual que
   * `forgotPassword`, más abajo).
   */
  private async sendVerificationEmail(user: {
    id: string;
    email: string;
    firstName?: string | null;
  }): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + EMAIL_VERIFICATION_EXPIRY_HOURS);

    await this.repository.createEmailVerificationToken(
      user.id,
      tokenHash,
      expiresAt,
    );

    const verifyUrl = `${getAppPublicUrl()}/verify-email?token=${encodeURIComponent(
      rawToken,
    )}&email=${encodeURIComponent(user.email)}`;

    try {
      await this.emailService.send({
        to: user.email,
        subject: 'Confirmá tu cuenta de Flikker',
        html: buildVerificationEmail({
          firstName: user.firstName,
          verifyUrl,
          expiresInHours: EMAIL_VERIFICATION_EXPIRY_HOURS,
        }),
      });
      this.logger.log(`Verification email sent to ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Verification email failed for ${user.email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return rawToken;
  }
}

function getAppPublicUrl() {
  return (
    process.env.APP_PUBLIC_URL ??
    process.env.WEB_BASE_URL ??
    process.env.WEB_PUBLIC_URL ??
    'https://app.flikker.com'
  ).replace(/\/$/, '');
}

function buildVerificationEmail(input: {
  firstName?: string | null;
  verifyUrl: string;
  expiresInHours: number;
}) {
  const name = input.firstName?.trim() || 'hola';
  return `
    <div style="font-family:Arial,sans-serif;background:#F5F6FA;padding:32px;color:#1A202C">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E8EAF0;border-radius:12px;padding:32px">
        <h1 style="margin:0 0 12px;font-size:24px">Confirmá tu cuenta</h1>
        <p style="margin:0 0 20px;color:#8891A4;line-height:1.6">Hola ${escapeHtml(
          name,
        )}, te enviamos un enlace para confirmar tu cuenta de Flikker.</p>
        <a href="${input.verifyUrl}" style="display:inline-block;background:#5C6BC0;color:#fff;text-decoration:none;border-radius:8px;padding:14px 20px;font-weight:700">Confirmar mi cuenta</a>
        <p style="margin:20px 0 0;color:#8891A4;font-size:14px;line-height:1.6">El link vence en ${input.expiresInHours} horas. Si no creaste esta cuenta, podés ignorar este email.</p>
      </div>
    </div>
  `;
}

function buildPasswordResetEmail(input: {
  firstName?: string | null;
  resetUrl: string;
  expiresInMinutes: number;
}) {
  const name = input.firstName?.trim() || 'hola';
  return `
    <div style="font-family:Arial,sans-serif;background:#F5F6FA;padding:32px;color:#1A202C">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E8EAF0;border-radius:12px;padding:32px">
        <h1 style="margin:0 0 12px;font-size:24px">Recuperá tu contraseña</h1>
        <p style="margin:0 0 20px;color:#8891A4;line-height:1.6">Hola ${escapeHtml(
          name,
        )}, recibimos un pedido para crear una nueva contraseña en Flikker.</p>
        <a href="${input.resetUrl}" style="display:inline-block;background:#5C6BC0;color:#fff;text-decoration:none;border-radius:8px;padding:14px 20px;font-weight:700">Crear nueva contraseña</a>
        <p style="margin:20px 0 0;color:#8891A4;font-size:14px;line-height:1.6">El link vence en ${input.expiresInMinutes} minutos. Si no pediste este cambio, podés ignorar este email.</p>
      </div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
