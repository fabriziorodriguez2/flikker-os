import { BusinessStatus, SubscriptionStatus } from '@prisma/client';
import { AuthRepository } from './auth.repository';

describe('AuthRepository', () => {
  it('creates signup business as ACTIVE with active Pro subscription', async () => {
    const tx = {
      business: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'business-1' }),
      },
      user: {
        create: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      plan: {
        upsert: jest.fn().mockResolvedValue({ id: 'plan-pro' }),
      },
      subscription: {
        create: jest.fn().mockResolvedValue({ id: 'subscription-1' }),
      },
      membership: {
        create: jest.fn().mockResolvedValue({ id: 'membership-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const repository = new AuthRepository(prisma as never);

    await repository.createSignupAccount({
      email: 'owner@example.com',
      passwordHash: 'hash',
      businessName: 'Clinica Test',
      vertical: 'dental',
      timezone: 'America/Montevideo',
    });

    expect(tx.business.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BusinessStatus.ACTIVE,
          messageQuotaMonthly: 600,
        }),
      }),
    );
    expect(tx.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planId: 'plan-pro',
          status: SubscriptionStatus.ACTIVE,
        }),
      }),
    );
  });
});
