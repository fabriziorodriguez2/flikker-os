import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import type { AuthRepository } from './auth.repository';

function makeRepo() {
  return {
    findResetToken: jest.fn(),
    executePasswordReset: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(repo: ReturnType<typeof makeRepo>) {
  return new AuthService(
    repo as unknown as AuthRepository,
    {} as never,
    {} as never,
  );
}

function liveToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-1',
    userId: 'u-1',
    usedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    user: { email: 'owner@negocio.com' },
    ...overrides,
  };
}

describe('AuthService.resetPassword', () => {
  it('updates the password, consumes the token and revokes sessions', async () => {
    const repo = makeRepo();
    repo.findResetToken.mockResolvedValue(liveToken());
    const service = makeService(repo);

    const result = await service.resetPassword({
      token: 'raw-token',
      newPassword: 'nuevaClave123',
    });

    expect(repo.executePasswordReset).toHaveBeenCalledTimes(1);
    const [userId, storedHash, tokenId] = repo.executePasswordReset.mock
      .calls[0] as [string, string, string];
    expect(userId).toBe('u-1');
    // executePasswordReset marks the token used and revokes sessions atomically.
    expect(tokenId).toBe('token-1');
    expect(storedHash).not.toBe('nuevaClave123');
    await expect(bcrypt.compare('nuevaClave123', storedHash)).resolves.toBe(
      true,
    );
    expect(result).toEqual({ message: 'Password updated successfully' });
  });

  it('works with a token-only link (no email in the URL)', async () => {
    const repo = makeRepo();
    repo.findResetToken.mockResolvedValue(liveToken());
    const service = makeService(repo);

    await expect(
      service.resetPassword({ token: 'raw-token', newPassword: 'clave12345' }),
    ).resolves.toBeDefined();
  });

  it('still accepts a legacy link whose email matches the token owner', async () => {
    const repo = makeRepo();
    repo.findResetToken.mockResolvedValue(liveToken());
    const service = makeService(repo);

    await expect(
      service.resetPassword({
        token: 'raw-token',
        email: 'Owner@Negocio.com ',
        newPassword: 'clave12345',
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a legacy link whose email belongs to someone else', async () => {
    const repo = makeRepo();
    repo.findResetToken.mockResolvedValue(liveToken());
    const service = makeService(repo);

    await expect(
      service.resetPassword({
        token: 'raw-token',
        email: 'otro@negocio.com',
        newPassword: 'clave12345',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.executePasswordReset).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', null],
    ['already used', liveToken({ usedAt: new Date() })],
    ['expired', liveToken({ expiresAt: new Date(Date.now() - 60_000) })],
  ])('rejects a %s token without changing anything', async (_label, stored) => {
    const repo = makeRepo();
    repo.findResetToken.mockResolvedValue(stored);
    const service = makeService(repo);

    await expect(
      service.resetPassword({ token: 'raw-token', newPassword: 'clave12345' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.executePasswordReset).not.toHaveBeenCalled();
  });

  it('uses one indistinguishable message for every token failure', async () => {
    const repo = makeRepo();
    const service = makeService(repo);
    const messages: string[] = [];

    for (const stored of [
      null,
      liveToken({ usedAt: new Date() }),
      liveToken({ expiresAt: new Date(Date.now() - 60_000) }),
    ]) {
      repo.findResetToken.mockResolvedValue(stored);
      try {
        await service.resetPassword({
          token: 'raw-token',
          newPassword: 'clave12345',
        });
      } catch (error) {
        messages.push((error as BadRequestException).message);
      }
    }

    expect(new Set(messages).size).toBe(1);
  });
});
