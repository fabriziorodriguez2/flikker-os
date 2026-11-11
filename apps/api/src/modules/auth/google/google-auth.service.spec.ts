import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GoogleAuthService } from './google-auth.service';
import { GoogleAuthError } from './google-auth.error';
import type { GoogleIdentity } from './google-id-token.verifier';
import type { AuthRepository } from '../auth.repository';
import type { AuthService } from '../auth.service';
import type { GoogleOAuthClient } from './google-oauth.client';
import type { GoogleIdTokenVerifier } from './google-id-token.verifier';

const CALLBACK = {
  code: 'google-code',
  codeVerifier: 'v'.repeat(43),
  nonce: 'n'.repeat(43),
};

const IDENTITY: GoogleIdentity = {
  sub: 'google-sub-1',
  email: 'Mateo@Gmail.com',
  emailVerified: true,
  name: 'Mateo Gómez',
  givenName: 'Mateo',
  familyName: 'Gómez',
};

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'mateo@gmail.com',
    firstName: 'Mateo',
    lastName: 'Gómez',
    passwordHash: 'existing-hash',
    googleSub: null,
    isActive: true,
    isPlatformAdmin: false,
    emailVerifiedAt: new Date('2026-01-01'),
    pendingUpgradePlan: null,
    ...overrides,
  };
}

function setup() {
  const repo = {
    findUserByGoogleSub: jest.fn().mockResolvedValue(null),
    findUserByEmail: jest.fn().mockResolvedValue(null),
    createGoogleUser: jest
      .fn()
      .mockImplementation((data: Record<string, unknown>) =>
        Promise.resolve(
          makeUser({
            id: 'new-user',
            passwordHash: null,
            ...data,
            emailVerifiedAt: new Date(),
          }),
        ),
      ),
    linkGoogleSub: jest.fn().mockResolvedValue({ count: 1 }),
    setPendingUpgradePlanIfEmpty: jest.fn().mockResolvedValue({ count: 1 }),
    findMembershipsForUser: jest.fn().mockResolvedValue([]),
  };
  const authService = {
    issueSession: jest
      .fn()
      .mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
  };
  const oauth = {
    clientId: 'client-id',
    isConfigured: jest.fn().mockReturnValue(true),
    buildAuthorizationUrl: jest
      .fn()
      .mockReturnValue('https://accounts.google.com/x'),
    exchangeCodeForIdToken: jest.fn().mockResolvedValue('id-token'),
  };
  const verifier = {
    verify: jest.fn().mockResolvedValue(IDENTITY),
  };
  const service = new GoogleAuthService(
    repo as unknown as AuthRepository,
    authService as unknown as AuthService,
    oauth as unknown as GoogleOAuthClient,
    verifier as unknown as GoogleIdTokenVerifier,
  );
  return { service, repo, authService, oauth, verifier };
}

describe('GoogleAuthService', () => {
  describe('User nuevo', () => {
    it('crea el User con email normalizado, googleSub y sin Business; sesión Flikker normal', async () => {
      const { service, repo, authService } = setup();

      const result = await service.authenticate(CALLBACK, 'ua', '1.2.3.4');

      expect(repo.createGoogleUser).toHaveBeenCalledWith({
        email: 'mateo@gmail.com',
        googleSub: 'google-sub-1',
        firstName: 'Mateo',
        lastName: 'Gómez',
        pendingUpgradePlan: null,
      });
      expect(authService.issueSession).toHaveBeenCalledWith(
        'new-user',
        'ua',
        '1.2.3.4',
      );
      expect(result).toEqual(
        expect.objectContaining({
          accessToken: 'access',
          refreshToken: 'refresh',
          memberships: [],
          isNewUser: true,
        }),
      );
      expect(result.user.pendingUpgradePlan).toBeNull();
    });

    it('valida el ID token contra nuestro client id y el nonce de la cookie', async () => {
      const { service, verifier, oauth } = setup();
      await service.authenticate(CALLBACK);
      expect(oauth.exchangeCodeForIdToken).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'google-code',
          codeVerifier: CALLBACK.codeVerifier,
        }),
      );
      expect(verifier.verify).toHaveBeenCalledWith('id-token', {
        audience: 'client-id',
        nonce: CALLBACK.nonce,
      });
    });

    it('sin nombre en Google: usa la parte local del email', async () => {
      const { service, repo, verifier } = setup();
      verifier.verify.mockResolvedValue({
        ...IDENTITY,
        name: null,
        givenName: null,
        familyName: null,
      });
      await service.authenticate(CALLBACK);
      expect(repo.createGoogleUser).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'mateo', lastName: '' }),
      );
    });

    it.each(['MONTHLY', 'YEARLY'] as const)(
      'intención PRO %s sobrevive: pendingUpgradePlan guardado al crear',
      async (plan) => {
        const { service, repo } = setup();
        const result = await service.authenticate({
          ...CALLBACK,
          pendingUpgradePlan: plan,
        });
        expect(repo.createGoogleUser).toHaveBeenCalledWith(
          expect.objectContaining({ pendingUpgradePlan: plan }),
        );
        expect(result.user.pendingUpgradePlan).toBe(plan);
      },
    );

    it('doble callback concurrente (P2002): error genérico, nunca un segundo User', async () => {
      const { service, repo } = setup();
      repo.createGoogleUser.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '0.0.0',
        }),
      );
      await expect(service.authenticate(CALLBACK)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('User existente', () => {
    it('mismo googleSub → mismo User, sin resolver por email', async () => {
      const { service, repo } = setup();
      repo.findUserByGoogleSub.mockResolvedValue(
        makeUser({ googleSub: 'google-sub-1', email: 'otro@gmail.com' }),
      );

      const result = await service.authenticate(CALLBACK);

      expect(result.user.id).toBe('user-1');
      expect(repo.findUserByEmail).not.toHaveBeenCalled();
      expect(repo.createGoogleUser).not.toHaveBeenCalled();
      expect(repo.linkGoogleSub).not.toHaveBeenCalled();
    });

    it('mismo email verificado sin sub → linkea ESE User, conserva la password, no duplica', async () => {
      const { service, repo } = setup();
      repo.findUserByEmail.mockResolvedValue(makeUser());

      const result = await service.authenticate(CALLBACK);

      expect(repo.findUserByEmail).toHaveBeenCalledWith('mateo@gmail.com');
      expect(repo.linkGoogleSub).toHaveBeenCalledWith(
        'user-1',
        'google-sub-1',
        {
          discardUnverifiedPassword: false,
        },
      );
      expect(repo.createGoogleUser).not.toHaveBeenCalled();
      expect(result.user.id).toBe('user-1');
      expect(result.isNewUser).toBe(false);
    });

    it('email existente SIN confirmar: se linkea verificándolo y descartando su password (anti pre-hijacking)', async () => {
      const { service, repo } = setup();
      repo.findUserByEmail.mockResolvedValue(
        makeUser({ emailVerifiedAt: null }),
      );

      await service.authenticate(CALLBACK);

      expect(repo.linkGoogleSub).toHaveBeenCalledWith(
        'user-1',
        'google-sub-1',
        {
          discardUnverifiedPassword: true,
        },
      );
    });

    it('email ya asociado a OTRA identidad Google → identity conflict, sin sesión', async () => {
      const { service, repo, authService } = setup();
      repo.findUserByEmail.mockResolvedValue(
        makeUser({ googleSub: 'otro-sub' }),
      );

      await expect(service.authenticate(CALLBACK)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repo.linkGoogleSub).not.toHaveBeenCalled();
      expect(authService.issueSession).not.toHaveBeenCalled();
    });

    it('link que pierde la carrera (count 0) → rechazado', async () => {
      const { service, repo, authService } = setup();
      repo.findUserByEmail.mockResolvedValue(makeUser());
      repo.linkGoogleSub.mockResolvedValue({ count: 0 });

      await expect(service.authenticate(CALLBACK)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(authService.issueSession).not.toHaveBeenCalled();
    });

    it('User desactivado → rechazado', async () => {
      const { service, repo } = setup();
      repo.findUserByGoogleSub.mockResolvedValue(
        makeUser({ googleSub: 'google-sub-1', isActive: false }),
      );
      await expect(service.authenticate(CALLBACK)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('con Business + intención PRO: la ignora (no entra a pre-onboarding)', async () => {
      const { service, repo } = setup();
      repo.findUserByGoogleSub.mockResolvedValue(
        makeUser({ googleSub: 'google-sub-1' }),
      );
      repo.findMembershipsForUser.mockResolvedValue([
        {
          businessId: 'biz-1',
          role: 'OWNER',
          business: { name: 'B', slug: 'b' },
        },
      ]);

      const result = await service.authenticate({
        ...CALLBACK,
        pendingUpgradePlan: 'MONTHLY',
      });

      expect(repo.setPendingUpgradePlanIfEmpty).not.toHaveBeenCalled();
      expect(result.user.pendingUpgradePlan).toBeNull();
    });

    it('sin Business + intención PRO: se guarda solo si no había otra', async () => {
      const { service, repo } = setup();
      repo.findUserByGoogleSub.mockResolvedValue(
        makeUser({ googleSub: 'google-sub-1' }),
      );

      const result = await service.authenticate({
        ...CALLBACK,
        pendingUpgradePlan: 'YEARLY',
      });

      expect(repo.setPendingUpgradePlanIfEmpty).toHaveBeenCalledWith(
        'user-1',
        'YEARLY',
      );
      expect(result.user.pendingUpgradePlan).toBe('YEARLY');
    });

    it('sin Business con intención ya guardada: no la pisa', async () => {
      const { service, repo } = setup();
      repo.findUserByGoogleSub.mockResolvedValue(
        makeUser({ googleSub: 'google-sub-1', pendingUpgradePlan: 'MONTHLY' }),
      );

      const result = await service.authenticate({
        ...CALLBACK,
        pendingUpgradePlan: 'YEARLY',
      });

      expect(repo.setPendingUpgradePlanIfEmpty).not.toHaveBeenCalled();
      expect(result.user.pendingUpgradePlan).toBe('MONTHLY');
    });
  });

  describe('Seguridad', () => {
    it('email_verified=false → rechazado antes de buscar/crear/linkear nada', async () => {
      const { service, repo, verifier, authService } = setup();
      verifier.verify.mockResolvedValue({ ...IDENTITY, emailVerified: false });

      await expect(service.authenticate(CALLBACK)).rejects.toThrow(
        'No pudimos iniciar sesión con Google. Probá de nuevo.',
      );
      expect(repo.findUserByGoogleSub).not.toHaveBeenCalled();
      expect(repo.findUserByEmail).not.toHaveBeenCalled();
      expect(repo.createGoogleUser).not.toHaveBeenCalled();
      expect(authService.issueSession).not.toHaveBeenCalled();
    });

    it.each([
      ['code inválido', 'oauth'],
      ['token inválido (aud/iss/exp/firma)', 'verifier'],
    ])('%s → 401 con copy genérico, sin internals', async (_label, which) => {
      const { service, oauth, verifier } = setup();
      const err = new GoogleAuthError('invalid_something');
      if (which === 'oauth')
        oauth.exchangeCodeForIdToken.mockRejectedValue(err);
      else verifier.verify.mockRejectedValue(err);

      const promise = service.authenticate(CALLBACK);
      await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(promise).rejects.toThrow(
        'No pudimos iniciar sesión con Google. Probá de nuevo.',
      );
    });

    it('sin GOOGLE_* configurado → 503, nunca intenta el canje', async () => {
      const { service, oauth } = setup();
      oauth.isConfigured.mockReturnValue(false);

      await expect(service.authenticate(CALLBACK)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(() =>
        service.createAuthorizationUrl({
          state: 's',
          nonce: 'n',
          codeChallenge: 'c',
        }),
      ).toThrow(ServiceUnavailableException);
      expect(oauth.exchangeCodeForIdToken).not.toHaveBeenCalled();
    });
  });
});
