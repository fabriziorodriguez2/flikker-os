import { AuthRepository } from './auth.repository';

describe('AuthRepository', () => {
  it('createUnverifiedUser crea SOLO el usuario, sin negocio ni sesión', async () => {
    const user = {
      create: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };
    const prisma = { user };
    const repository = new AuthRepository(prisma as never);

    await repository.createUnverifiedUser({
      email: 'owner@example.com',
      passwordHash: 'hash',
      firstName: 'Ana',
      lastName: 'Pérez',
    });

    expect(user.create).toHaveBeenCalledWith({
      data: {
        email: 'owner@example.com',
        passwordHash: 'hash',
        firstName: 'Ana',
        lastName: 'Pérez',
        isActive: true,
        emailVerifiedAt: null,
      },
    });
  });

  it('executeEmailVerification marca el usuario verificado y consume el token en una transacción', async () => {
    const userUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tokenUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      user: { updateMany: userUpdateMany },
      emailVerificationToken: { update: tokenUpdate },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    const repository = new AuthRepository(prisma as never);

    await repository.executeEmailVerification('user-1', 'token-1');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', emailVerifiedAt: null },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(tokenUpdate).toHaveBeenCalledWith({
      where: { id: 'token-1' },
      data: { usedAt: expect.any(Date) },
    });
  });
});
