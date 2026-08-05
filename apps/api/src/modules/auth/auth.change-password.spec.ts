import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import type { AuthRepository } from './auth.repository';

// Plain-object mocks cast at the seam so eslint's unbound-method rule stays
// happy, matching the convention used by the other specs in this repo.
function makeRepo() {
  return {
    findUserCredentials: jest.fn(),
    updatePasswordAndRevokeSessions: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(repo: ReturnType<typeof makeRepo>) {
  return new AuthService(
    repo as unknown as AuthRepository,
    {} as never,
    {} as never,
  );
}

describe('AuthService.changePassword', () => {
  const currentPassword = 'currentPass123';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(currentPassword, 10);
  });

  it('stores a hash of the user-chosen password and revokes sessions', async () => {
    const repo = makeRepo();
    repo.findUserCredentials.mockResolvedValue({
      id: 'u-1',
      passwordHash,
      isActive: true,
    });
    const service = makeService(repo);

    const result = await service.changePassword('u-1', {
      currentPassword,
      newPassword: 'brandNewPass456',
    });

    expect(repo.updatePasswordAndRevokeSessions).toHaveBeenCalledTimes(1);
    const [userId, storedHash] = repo.updatePasswordAndRevokeSessions.mock
      .calls[0] as [string, string];
    expect(userId).toBe('u-1');
    // Never stored in plain text, and it is the password the user chose.
    expect(storedHash).not.toBe('brandNewPass456');
    await expect(bcrypt.compare('brandNewPass456', storedHash)).resolves.toBe(
      true,
    );
    expect(result).toEqual({ message: 'Password updated successfully' });
  });

  it('rejects a wrong current password without writing anything', async () => {
    const repo = makeRepo();
    repo.findUserCredentials.mockResolvedValue({
      id: 'u-1',
      passwordHash,
      isActive: true,
    });
    const service = makeService(repo);

    await expect(
      service.changePassword('u-1', {
        currentPassword: 'wrongPassword',
        newPassword: 'brandNewPass456',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.updatePasswordAndRevokeSessions).not.toHaveBeenCalled();
  });

  it('rejects reusing the current password', async () => {
    const repo = makeRepo();
    repo.findUserCredentials.mockResolvedValue({
      id: 'u-1',
      passwordHash,
      isActive: true,
    });
    const service = makeService(repo);

    await expect(
      service.changePassword('u-1', {
        currentPassword,
        newPassword: currentPassword,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.updatePasswordAndRevokeSessions).not.toHaveBeenCalled();
  });

  it('rejects an unknown or inactive user', async () => {
    const repo = makeRepo();
    repo.findUserCredentials.mockResolvedValue(null);
    const service = makeService(repo);

    await expect(
      service.changePassword('u-nope', {
        currentPassword,
        newPassword: 'brandNewPass456',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    repo.findUserCredentials.mockResolvedValue({
      id: 'u-1',
      passwordHash,
      isActive: false,
    });
    await expect(
      service.changePassword('u-1', {
        currentPassword,
        newPassword: 'brandNewPass456',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.updatePasswordAndRevokeSessions).not.toHaveBeenCalled();
  });
});
