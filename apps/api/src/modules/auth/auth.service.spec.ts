import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../../jobs/email.service';
import {
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

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
  createUnverifiedUser: jest.fn(),
  createEmailVerificationToken: jest.fn(),
  findEmailVerificationToken: jest.fn(),
  executeEmailVerification: jest.fn(),
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('signed-token'),
  verify: jest.fn(),
};

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
    const SIGNUP_DTO = {
      name: 'Ana Pérez',
      email: 'OWNER@EXAMPLE.COM',
      password: 'password1',
      confirmPassword: 'password1',
    };

    it('crea SOLO el usuario (sin negocio) y no devuelve tokens', async () => {
      mockRepository.findUserByEmail.mockResolvedValue(null);
      mockRepository.createUnverifiedUser.mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
        firstName: 'Ana',
      });
      mockRepository.createEmailVerificationToken.mockResolvedValue({});

      const result = await service.signup(SIGNUP_DTO);

      expect(mockRepository.createUnverifiedUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'owner@example.com',
          firstName: 'Ana',
          lastName: 'Pérez',
        }),
      );
      expect(mockRepository.createEmailVerificationToken).toHaveBeenCalled();
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'owner@example.com' }),
      );
      expect(result).not.toHaveProperty('accessToken');
      expect(result.message).toBe('Revisá tu correo');
    });

    it('rechaza si las contraseñas no coinciden, sin tocar el repositorio', async () => {
      await expect(
        service.signup({ ...SIGNUP_DTO, confirmPassword: 'otra-pass' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepository.findUserByEmail).not.toHaveBeenCalled();
      expect(mockRepository.createUnverifiedUser).not.toHaveBeenCalled();
    });

    it('rechaza un email ya existente (evita duplicar cuentas en doble clic)', async () => {
      mockRepository.findUserByEmail.mockResolvedValue({ id: 'user-existing' });

      await expect(service.signup(SIGNUP_DTO)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepository.createUnverifiedUser).not.toHaveBeenCalled();
    });

    it('en no-producción devuelve el token para poder testear sin correo real', async () => {
      process.env.NODE_ENV = 'development';
      mockRepository.findUserByEmail.mockResolvedValue(null);
      mockRepository.createUnverifiedUser.mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
        firstName: 'Ana',
      });

      const result = await service.signup(SIGNUP_DTO);
      expect(typeof result._dev_token).toBe('string');
    });

    it('en producción NO devuelve el token', async () => {
      process.env.NODE_ENV = 'production';
      mockRepository.findUserByEmail.mockResolvedValue(null);
      mockRepository.createUnverifiedUser.mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
        firstName: 'Ana',
      });

      const result = await service.signup(SIGNUP_DTO);
      expect(result._dev_token).toBeUndefined();
    });

    it('un error al enviar el correo no revienta el alta (se loguea, no se propaga)', async () => {
      mockRepository.findUserByEmail.mockResolvedValue(null);
      mockRepository.createUnverifiedUser.mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
        firstName: 'Ana',
      });
      mockEmailService.send.mockRejectedValueOnce(new Error('smtp down'));

      await expect(service.signup(SIGNUP_DTO)).resolves.toMatchObject({
        message: 'Revisá tu correo',
      });
    });
  });

  describe('verifyEmail', () => {
    it('token inexistente, usado o vencido: mismo error genérico', async () => {
      mockRepository.findEmailVerificationToken.mockResolvedValue(null);
      await expect(service.verifyEmail({ token: 'bad-token' })).rejects.toThrow(
        BadRequestException,
      );

      mockRepository.findEmailVerificationToken.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 10000),
        user: { id: 'u1', email: 'a@b.com', firstName: 'Ana' },
      });
      await expect(
        service.verifyEmail({ token: 'used-token' }),
      ).rejects.toThrow(BadRequestException);

      mockRepository.findEmailVerificationToken.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 10000),
        user: { id: 'u1', email: 'a@b.com', firstName: 'Ana' },
      });
      await expect(
        service.verifyEmail({ token: 'expired-token' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockRepository.executeEmailVerification).not.toHaveBeenCalled();
    });

    it('token válido: consume el token y arranca una sesión real', async () => {
      mockRepository.findEmailVerificationToken.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 10000),
        user: { id: 'u1', email: 'owner@example.com', firstName: 'Ana' },
      });
      mockRepository.executeEmailVerification.mockResolvedValue([{}, {}]);
      mockRepository.createSession.mockResolvedValue({});
      mockRepository.findMembershipsForUser.mockResolvedValue([]);

      const result = await service.verifyEmail({ token: 'good-token' });

      expect(mockRepository.executeEmailVerification).toHaveBeenCalledWith(
        'u1',
        't1',
      );
      expect(mockRepository.createSession).toHaveBeenCalled();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('owner@example.com');
      // Recién verificado: sin negocio todavía, el paso 1 de /comenzar lo crea.
      expect(result.memberships).toEqual([]);
    });
  });

  describe('resendVerification', () => {
    it('mismo mensaje genérico si el email no existe (no enumeration)', async () => {
      mockRepository.findUserByEmail.mockResolvedValue(null);
      const result = await service.resendVerification({
        email: 'nope@example.com',
      });
      expect(result.message).toMatch(/reenviamos/i);
      expect(
        mockRepository.createEmailVerificationToken,
      ).not.toHaveBeenCalled();
    });

    it('mismo mensaje genérico si la cuenta YA está verificada (no reenvía)', async () => {
      mockRepository.findUserByEmail.mockResolvedValue({
        id: 'u1',
        isActive: true,
        emailVerifiedAt: new Date(),
      });
      const result = await service.resendVerification({
        email: 'owner@example.com',
      });
      expect(result.message).toMatch(/reenviamos/i);
      expect(
        mockRepository.createEmailVerificationToken,
      ).not.toHaveBeenCalled();
    });

    it('cuenta sin verificar: crea un token nuevo y reenvía', async () => {
      mockRepository.findUserByEmail.mockResolvedValue({
        id: 'u1',
        email: 'owner@example.com',
        firstName: 'Ana',
        isActive: true,
        emailVerifiedAt: null,
      });

      await service.resendVerification({ email: 'owner@example.com' });

      expect(mockRepository.createEmailVerificationToken).toHaveBeenCalled();
      expect(mockEmailService.send).toHaveBeenCalled();
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
        emailVerifiedAt: new Date(),
      });
      await expect(
        service.login({ email: 'user@example.com', password: 'wrong-pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    /**
     * El check de verificación va DESPUÉS del de contraseña — antes de saber
     * que la contraseña es correcta, revelar "sin confirmar" sería un
     * oráculo de enumeración de emails.
     */
    it('cuenta sin confirmar: bloquea con un mensaje propio, ni entra ni filtra antes de validar la contraseña', async () => {
      const hash = await bcrypt.hash('correct-pass', 10);
      mockRepository.findUserByEmail.mockResolvedValue({
        id: '1',
        email: 'user@example.com',
        isActive: true,
        passwordHash: hash,
        firstName: 'Test',
        lastName: 'User',
        emailVerifiedAt: null,
      });

      await expect(
        service.login({ email: 'user@example.com', password: 'wrong-pass' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockRepository.createSession).not.toHaveBeenCalled();

      await expect(
        service.login({ email: 'user@example.com', password: 'correct-pass' }),
      ).rejects.toThrow(/[Cc]onfirmá tu correo/);
      expect(mockRepository.createSession).not.toHaveBeenCalled();
    });

    it('returns tokens and memberships on valid credentials with a verified email', async () => {
      const hash = await bcrypt.hash('correct-pass', 10);
      mockRepository.findUserByEmail.mockResolvedValue({
        id: '1',
        email: 'user@example.com',
        isActive: true,
        passwordHash: hash,
        firstName: 'Test',
        lastName: 'User',
        emailVerifiedAt: new Date(),
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
