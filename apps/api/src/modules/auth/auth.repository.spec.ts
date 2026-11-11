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
        pendingUpgradePlan: null,
      },
    });
  });

  it('createUnverifiedUser guarda pendingUpgradePlan cuando el signup viene con intención Pro', async () => {
    const user = { create: jest.fn().mockResolvedValue({ id: 'user-1' }) };
    const prisma = { user };
    const repository = new AuthRepository(prisma as never);

    await repository.createUnverifiedUser({
      email: 'owner@example.com',
      passwordHash: 'hash',
      firstName: 'Ana',
      lastName: 'Pérez',
      pendingUpgradePlan: 'YEARLY' as never,
    });

    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pendingUpgradePlan: 'YEARLY' }),
      }),
    );
  });

  it('clearPendingUpgradePlan lo vuelve null', async () => {
    const update = jest
      .fn()
      .mockResolvedValue({ id: 'user-1', pendingUpgradePlan: null });
    const prisma = { user: { update } };
    const repository = new AuthRepository(prisma as never);

    await repository.clearPendingUpgradePlan('user-1');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { pendingUpgradePlan: null },
      select: { id: true, pendingUpgradePlan: true },
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

  describe('checkout pre-onboarding (Parte 5D)', () => {
    it('findInProgressPreOnboardingCheckoutLead busca por requestedByUserId, businessId null y plan', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'lead-1' });
      const repository = new AuthRepository({
        checkoutLead: { findFirst },
      } as never);

      await repository.findInProgressPreOnboardingCheckoutLead(
        'user-1',
        'MONTHLY' as never,
      );

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            requestedByUserId: 'user-1',
            businessId: null,
            plan: 'MONTHLY',
          }),
        }),
      );
    });

    it('createPreOnboardingCheckoutLead crea el lead con businessId null explícito', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'lead-new' });
      const repository = new AuthRepository({
        checkoutLead: { create },
      } as never);

      await repository.createPreOnboardingCheckoutLead({
        requestedByUserId: 'user-1',
        email: 'ana@ejemplo.com',
        plan: 'YEARLY' as never,
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestedByUserId: 'user-1',
            businessId: null,
            email: 'ana@ejemplo.com',
            plan: 'YEARLY',
          }),
        }),
      );
    });

    it('findLatestPreOnboardingCheckoutLead busca el más reciente de este User sin Business todavía', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'lead-1' });
      const repository = new AuthRepository({
        checkoutLead: { findFirst },
      } as never);

      await repository.findLatestPreOnboardingCheckoutLead('user-1');

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { requestedByUserId: 'user-1', businessId: null },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('findCheckoutLeadById busca por id exacto, SIN filtrar por businessId', async () => {
      const findUnique = jest.fn().mockResolvedValue({ id: 'lead-1' });
      const repository = new AuthRepository({
        checkoutLead: { findUnique },
      } as never);

      await repository.findCheckoutLeadById('lead-1');

      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lead-1' } }),
      );
    });
  });

  describe('updateNotificationWhatsapp (Parte 5E)', () => {
    it('guarda el valor tal cual recibe — la normalización ya pasó en el servicio', async () => {
      const update = jest.fn().mockResolvedValue({
        id: 'user-1',
        notificationWhatsapp: '+59899123456',
      });
      const repository = new AuthRepository({ user: { update } } as never);

      await repository.updateNotificationWhatsapp('user-1', '+59899123456');

      expect(update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { notificationWhatsapp: '+59899123456' },
        select: { id: true, notificationWhatsapp: true },
      });
    });
  });

  describe('Continuar con Google', () => {
    it('createGoogleUser: nace verificado, sin password, con googleSub y sin negocio', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'user-1' });
      const repository = new AuthRepository({ user: { create } } as never);

      await repository.createGoogleUser({
        email: 'mateo@gmail.com',
        googleSub: 'sub-1',
        firstName: 'Mateo',
        lastName: 'Gómez',
        pendingUpgradePlan: 'MONTHLY' as never,
      });

      const { data } = create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).toEqual(
        expect.objectContaining({
          email: 'mateo@gmail.com',
          googleSub: 'sub-1',
          passwordHash: null,
          isActive: true,
          pendingUpgradePlan: 'MONTHLY',
        }),
      );
      expect(data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(data).not.toHaveProperty('memberships');
    });

    it('linkGoogleSub: condicional a googleSub null y conserva la password de una cuenta verificada', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const repository = new AuthRepository({ user: { updateMany } } as never);

      await repository.linkGoogleSub('user-1', 'sub-1', {
        discardUnverifiedPassword: false,
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', googleSub: null },
        data: { googleSub: 'sub-1' },
      });
    });

    it('linkGoogleSub sobre cuenta sin verificar: la verifica y descarta la password', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const repository = new AuthRepository({ user: { updateMany } } as never);

      await repository.linkGoogleSub('user-1', 'sub-1', {
        discardUnverifiedPassword: true,
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', googleSub: null },
        data: {
          googleSub: 'sub-1',
          emailVerifiedAt: expect.any(Date) as unknown,
          passwordHash: null,
        },
      });
    });

    it('setPendingUpgradePlanIfEmpty nunca pisa una intención existente', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const repository = new AuthRepository({ user: { updateMany } } as never);

      await repository.setPendingUpgradePlanIfEmpty(
        'user-1',
        'YEARLY' as never,
      );

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', pendingUpgradePlan: null },
        data: { pendingUpgradePlan: 'YEARLY' },
      });
    });
  });
});
