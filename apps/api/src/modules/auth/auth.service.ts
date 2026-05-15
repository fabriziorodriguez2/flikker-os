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
import { EmailService } from '../../jobs/email.service';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_EXPIRY_MINUTES = 30;
const PASSWORD_RESET_MESSAGE = 'Email enviado';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async signup(dto: SignupDto, userAgent?: string, ip?: string) {
    const email = dto.email.toLowerCase();
    const existingUser = await this.repository.findUserByEmail(email);

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { user } = await this.repository.createSignupAccount({
      email,
      passwordHash,
      businessName: dto.businessName.trim(),
      vertical: dto.vertical,
      timezone: dto.timezone  'America/Montevideo',
    });

    const { accessToken, refreshToken, refreshTokenHash } = this.generateTokens(
      user.id,
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.repository.createSession({
      userId: user.id,
      refreshTokenHash,
      userAgent: userAgent  null,
      ip: ip  null,
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

  async login(dto: LoginDto, userAgent?: string, ip?: string) {
    const user = await this.repository.findUserByEmail(dto.email.toLowerCase());

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken, refreshTokenHash } = this.generateTokens(
      user.id,
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.repository.createSession({
      userId: user.id,
      refreshTokenHash,
      userAgent: userAgent  null,
      ip: ip  null,
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

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

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
    const user = await this.repository.findUserByEmail(dto.email.toLowerCase());

    // Always return 200 to avoid email enumeration
    if (!user || !user.isActive) {
      this.logger.warn(
        `Password reset requested for unknown or inactive email: ${dto.email.toLowerCase()}`,
      );
      return { message: PASSWORD_RESET_MESSAGE };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + RESET_TOKEN_EXPIRY_MINUTES);

    await this.repository.createResetToken(user.id, tokenHash, expiresAt);

    const resetUrl = `${getAppPublicUrl()}/reset-password?token=${encodeURIComponent(
      rawToken,
    )}&email=${encodeURIComponent(user.email)}`;

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
          error instanceof Error  error.message : String(error)
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
    const email = dto.email.toLowerCase();

    const resetToken = await this.repository.findResetToken(tokenHash);

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }
    if (resetToken.user.email.toLowerCase() !== email) {
      throw new BadRequestException('Email does not match reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.repository.executePasswordReset(
      resetToken.userId,
      passwordHash,
      resetToken.id,
    );

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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateTokens(userId: string) {
    const payload = { sub: userId };
    const secret = process.env.JWT_SECRET!;

    const accessToken = this.jwt.sign(payload, {
      secret,
      expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN  '15m') as StringValue,
    });

    const refreshToken = this.jwt.sign(payload, {
      secret,
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN  '7d') as StringValue,
    });

    const refreshTokenHash = this.hashToken(refreshToken);
    return { accessToken, refreshToken, refreshTokenHash };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

function getAppPublicUrl() {
  return (
    process.env.APP_PUBLIC_URL ?
    process.env.WEB_BASE_URL ?
    process.env.WEB_PUBLIC_URL ?
    'https://app.flikker.com'
  ).replace(/\/$/, '');
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
