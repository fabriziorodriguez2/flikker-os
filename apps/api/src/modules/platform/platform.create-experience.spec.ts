import { ExperienceVersion } from '@prisma/client';
import { PlatformRepository } from './platform.repository';

/**
 * Creation defaults. Only the admin flow may opt a brand-new business into
 * Check-in V2; everything else falls back to the schema default (LEGACY).
 */
function makePrisma() {
  const tx = {
    business: {
      create: jest.fn().mockResolvedValue({ id: 'biz-1', slug: 'cafe-uno' }),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    membership: { create: jest.fn().mockResolvedValue({}) },
    plan: { upsert: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
    subscription: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    // Used by buildUniqueSlug before the transaction starts.
    business: { ...tx.business, findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, tx };
}

const baseInput = {
  name: 'Café Uno',
  country: 'UY',
  timezone: 'America/Montevideo',
  ownerEmail: 'owner@negocio.com',
  ownerFirstName: 'Ana',
  ownerLastName: 'Perez',
  passwordHash: 'hash',
};

describe('createBusinessWithOwner — experience defaults', () => {
  it('omits the field when no experience is requested, so the schema default (LEGACY) applies', async () => {
    const { prisma, tx } = makePrisma();
    const repo = new PlatformRepository(prisma as never);

    await repo.createBusinessWithOwner(baseInput);

    const data = (tx.business.create.mock.calls[0][0] as { data: object })
      .data as Record<string, unknown>;
    expect(data).not.toHaveProperty('experienceVersion');
  });

  it('persists LEGACY when explicitly requested', async () => {
    const { prisma, tx } = makePrisma();
    const repo = new PlatformRepository(prisma as never);

    await repo.createBusinessWithOwner({
      ...baseInput,
      experienceVersion: ExperienceVersion.LEGACY,
    });

    const data = (tx.business.create.mock.calls[0][0] as { data: object })
      .data as Record<string, unknown>;
    expect(data.experienceVersion).toBe(ExperienceVersion.LEGACY);
  });

  it('persists CHECKIN_V2 when the admin opts a new pilot in', async () => {
    const { prisma, tx } = makePrisma();
    const repo = new PlatformRepository(prisma as never);

    await repo.createBusinessWithOwner({
      ...baseInput,
      experienceVersion: ExperienceVersion.CHECKIN_V2,
    });

    const data = (tx.business.create.mock.calls[0][0] as { data: object })
      .data as Record<string, unknown>;
    expect(data.experienceVersion).toBe(ExperienceVersion.CHECKIN_V2);
  });
});
