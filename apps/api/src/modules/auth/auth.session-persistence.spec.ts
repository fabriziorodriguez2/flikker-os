import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import type { AuthRepository } from './auth.repository';

// Plain-object mocks cast at the seam, matching the convention in this repo.
function makeRepo() {
  return {
    findUserByEmail: jest.fn(),
    createSession: jest.fn().mockResolvedValue(undefined),
    findMembershipsForUser: jest.fn().mockResolvedValue([]),
    findActiveSession: jest.fn(),
    findUserActiveStatus: jest.fn(),
    rotateSession: jest.fn().mockResolvedValue(undefined),
  };
}

function makeJwt() {
  return {
    sign: jest.fn().mockReturnValue('signed.jwt.token'),
    verify: jest.fn().mockReturnValue({ sub: 'u-1' }),
  };
}

function makeService(
  repo: ReturnType<typeof makeRepo>,
  jwt: ReturnType<typeof makeJwt>,
) {
  return new AuthService(
    repo as unknown as AuthRepository,
    jwt as never,
    {} as never,
  );
}

/** Whole days between now and `date`. */
function daysFromNow(date: Date): number {
  return Math.round((date.getTime() - Date.now()) / 86_400_000);
}

const DEFAULT_TTL_DAYS = 90;

describe('session persistence', () => {
  it('login stores a long-lived session so closing the browser keeps you logged in', async () => {
    const repo = makeRepo();
    const jwt = makeJwt();
    repo.findUserByEmail.mockResolvedValue({
      id: 'u-1',
      email: 'owner@negocio.com',
      firstName: 'Ana',
      lastName: 'Perez',
      isActive: true,
      isPlatformAdmin: false,
      passwordHash: await bcrypt.hash('secretPass1', 10),
      emailVerifiedAt: new Date(),
    });
    const service = makeService(repo, jwt);

    await service.login({
      email: 'owner@negocio.com',
      password: 'secretPass1',
    });

    expect(repo.createSession).toHaveBeenCalledTimes(1);
    const arg = repo.createSession.mock.calls[0][0] as { expiresAt: Date };
    expect(daysFromNow(arg.expiresAt)).toBe(DEFAULT_TTL_DAYS);
  });

  it('refresh rotates the token and slides the expiry forward', async () => {
    const repo = makeRepo();
    const jwt = makeJwt();
    repo.findActiveSession.mockResolvedValue({
      id: 's-1',
      userAgent: 'ua',
      ip: '1.2.3.4',
    });
    repo.findUserActiveStatus.mockResolvedValue({ id: 'u-1', isActive: true });
    const service = makeService(repo, jwt);

    const result = await service.refresh({ refreshToken: 'old.refresh.token' });

    expect(repo.rotateSession).toHaveBeenCalledTimes(1);
    const [oldSessionId, data] = repo.rotateSession.mock.calls[0] as [
      string,
      { expiresAt: Date },
    ];
    // Rotation: the previous session row is the one being replaced.
    expect(oldSessionId).toBe('s-1');
    expect(daysFromNow(data.expiresAt)).toBe(DEFAULT_TTL_DAYS);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('refresh fails when the session was revoked (logout, password change, admin)', async () => {
    const repo = makeRepo();
    const jwt = makeJwt();
    repo.findActiveSession.mockResolvedValue(null);
    const service = makeService(repo, jwt);

    await expect(
      service.refresh({ refreshToken: 'revoked.token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.rotateSession).not.toHaveBeenCalled();
  });

  it('refresh fails when the account was disabled', async () => {
    const repo = makeRepo();
    const jwt = makeJwt();
    repo.findActiveSession.mockResolvedValue({ id: 's-1' });
    repo.findUserActiveStatus.mockResolvedValue({ id: 'u-1', isActive: false });
    const service = makeService(repo, jwt);

    await expect(
      service.refresh({ refreshToken: 'valid.token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.rotateSession).not.toHaveBeenCalled();
  });

  it('refresh fails when the refresh JWT itself is invalid or expired', async () => {
    const repo = makeRepo();
    const jwt = makeJwt();
    jwt.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const service = makeService(repo, jwt);

    await expect(
      service.refresh({ refreshToken: 'expired.token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.findActiveSession).not.toHaveBeenCalled();
  });
});
