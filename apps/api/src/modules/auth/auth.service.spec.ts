import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../../jobs/email.service';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SignupVertical } from './dto/signup.dto';

const mockRepository = {
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  findUserActiveStatus: jest.fn(),
  createSession: jest.fn(),
  findActiveSession: jest.fn(),
  revokeSessionByTokenHash: jest.fn(),
  rotateSession: jest.fn(),
  createResetToken: jest.fn(),
  findResetToken: jest.fn(),
  executePasswordReset: jest.fn(),
  findMembershipsForUser: jest.fn(),
  findMembershipsWithStatus: jest.fn(),
  createSignupAccount: jest.fn(),
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('signed-token'),
  verify: jest.fn(),
};

// `EmailService` se agregó al constructor de AuthService (envío del mail de
// forgotPassword) después de que este archivo se escribiera — el módulo de
// test nunca lo actualizó, así que las 89 pruebas de este archivo fallaban
// por DI, no por comportamiento.
const mockEmailService = {
  send: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService', () => {
  let service: AuthService;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: mockRepository },
        { provide: JwtService, useValue: mockJwt },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('signup', () => {
    it('creates an account and returns an active business membership for dashboard access', async () => {
      mockRepository.findUserByEmail.mockResolvedValue(null);
      mockRepository.createSignupAccount.mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'owner@example.com',
          firstName: 'Clinica Test',
          lastName: 'Owner',
          isPlatformAdmin: false,
        },
        business: {
          id: 'business-1',
          status: 'ACTIVE',
          subscription: { status: 'ACTIVE', plan: { slug: 'pro' } },
        },
      });
      mockRepository.createSession.mockResolvedValue({});
      mockRepository.findMembershipsForUser.mockResolvedValue([
        {
          businessId: 'business-1',
          role: 'OWNER',
          business: {
            name: 'Clinica Test',
            slug: 'clinica-test',
            status: 'ACTIVE',
          },
        },
      ]);

      const result = await service.signup({
        email: 'OWNER@EXAMPLE.COM',
        password: 'password1',
        businessName: 'Clinica Test',
        // `vertical` es un enum (`SignupVertical`), no un string literal —
        // el DTO cambió después de escrito este test.
        vertical: SignupVertical.DENTAL,
        timezone: 'America/Montevideo',
      });

      expect(mockRepository.createSignupAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'owner@example.com',
          businessName: 'Clinica Test',
          vertical: 'dental',
          timezone: 'America/Montevideo',
        }),
      );
      expect(result.memberships).toEqual([
        expect.objectContaining({
          businessId: 'business-1',
          role: 'OWNER',
          business: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      ]);
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when user not found', async () => {
      mockRepository.findUserByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@example.com', password: 'password1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user is inactive', async () => {
      mockRepository.findUserByEmail.mockResolvedValue({
        id: '1',
        isActive: false,
        passwordHash: 'hash',
      });
      await expect(
        service.login({ email: 'user@example.com', password: 'password1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      const hash = await bcrypt.hash('correct-pass', 10);
      mockRepository.findUserByEmail.mockResolvedValue({
        id: '1',
        email: 'user@example.com',
        isActive: true,
        passwordHash: hash,
        firstName: 'Test',
        lastName: 'User',
      });
      await expect(
        service.login({ email: 'user@example.com', password: 'wrong-pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns tokens and memberships on valid credentials', async () => {
      const hash = await bcrypt.hash('correct-pass', 10);
      mockRepository.findUserByEmail.mockResolvedValue({
        id: '1',
        email: 'user@example.com',
        isActive: true,
        passwordHash: hash,
        firstName: 'Test',
        lastName: 'User',
      });
      mockRepository.createSession.mockResolvedValue({});
      mockRepository.findMembershipsForUser.mockResolvedValue([]);

      const result = await service.login({
        email: 'user@example.com',
        password: 'correct-pass',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe('user@example.com');
    });
  });

  describe('logout', () => {
    it('revokes the session associated with the refresh token', async () => {
      mockRepository.revokeSessionByTokenHash.mockResolvedValue({ count: 1 });
      await service.logout({ refreshToken: 'some-token' });
      expect(mockRepository.revokeSessionByTokenHash).toHaveBeenCalledWith(
        expect.any(String),
      );
    });
  });

  describe('forgotPassword', () => {
    it('returns generic message when user not found (no email enumeration)', async () => {
      mockRepository.findUserByEmail.mockResolvedValue(null);
      const result = await service.forgotPassword({
        email: 'nope@example.com',
      });
      expect(result.message).toBe('Email enviado');
      expect(result._dev_token).toBeUndefined();
    });

    it('creates reset token and returns dev token in non-production', async () => {
      process.env.NODE_ENV = 'development';
      mockRepository.findUserByEmail.mockResolvedValue({
        id: '1',
        isActive: true,
      });
      mockRepository.createResetToken.mockResolvedValue({});

      const result = await service.forgotPassword({
        email: 'user@example.com',
      });
      expect(result._dev_token).toBeDefined();
      expect(typeof result._dev_token).toBe('string');
    });

    it('does not return reset token in production', async () => {
      process.env.NODE_ENV = 'production';
      mockRepository.findUserByEmail.mockResolvedValue({
        id: '1',
        isActive: true,
      });
      mockRepository.createResetToken.mockResolvedValue({});

      const result = await service.forgotPassword({
        email: 'user@example.com',
      });

      expect(result).toEqual({ message: 'Email enviado' });
    });
  });

  describe('resetPassword', () => {
    it('throws BadRequestException if token not found', async () => {
      mockRepository.findResetToken.mockResolvedValue(null);
      await expect(
        service.resetPassword({
          token: 'bad-token',
          newPassword: 'newpassword1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if token already used', async () => {
      mockRepository.findResetToken.mockResolvedValue({
        id: '1',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 10000),
      });
      await expect(
        service.resetPassword({
          token: 'used-token',
          newPassword: 'newpassword1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if token expired', async () => {
      mockRepository.findResetToken.mockResolvedValue({
        id: '1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 10000),
      });
      await expect(
        service.resetPassword({
          token: 'expired-token',
          newPassword: 'newpassword1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
