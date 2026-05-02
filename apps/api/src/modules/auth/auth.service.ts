import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
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

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_EXPIRY_MINUTES = 60;
const PASSWORD_RESET_MESSAGE = 'Email enviado';

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
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
      timezone: dto.timezone ?? 'America/Montevideo',
    });

    const { accessToken, refreshToken, refreshTokenHash } = this.generateTokens(
      user.id,
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

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
      return { message: PASSWORD_RESET_MESSAGE };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + RESET_TOKEN_EXPIRY_MINUTES);

    await this.repository.createResetToken(user.id, tokenHash, expiresAt);

    // In production: send email with rawToken. For Phase 0 dev: return it directly.
    if (process.env.NODE_ENV !== 'production') {
      return { message: PASSWORD_RESET_MESSAGE, _dev_token: rawToken };
    }

    return { message: PASSWORD_RESET_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);

    const resetToken = await this.repository.findResetToken(tokenHash);

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
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
      expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as StringValue,
    });

    const refreshToken = this.jwt.sign(payload, {
      secret,
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as StringValue,
    });

    const refreshTokenHash = this.hashToken(refreshToken);
    return { accessToken, refreshToken, refreshTokenHash };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
