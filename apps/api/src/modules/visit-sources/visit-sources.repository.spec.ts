import { Prisma } from '@prisma/client';
import { VisitSourcesRepository } from './visit-sources.repository';

function makePrisma() {
  const visitSource = {
    findFirst: jest.fn(),
    create: jest.fn(),
  };
  const prisma = { visitSource };
  return { prisma, visitSource };
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('VisitSourcesRepository.ensureDefaultSource', () => {
  it('returns the existing default without creating a new one', async () => {
    const { prisma, visitSource } = makePrisma();
    visitSource.findFirst.mockResolvedValue({
      id: 'default-1',
      isDefault: true,
    });
    const repo = new VisitSourcesRepository(prisma as never);

    const result = await repo.ensureDefaultSource('biz-1');

    expect(result).toEqual({ id: 'default-1', isDefault: true });
    expect(visitSource.create).not.toHaveBeenCalled();
  });

  it('creates the default source when none exists', async () => {
    const { prisma, visitSource } = makePrisma();
    visitSource.findFirst.mockResolvedValueOnce(null);
    visitSource.create.mockResolvedValue({
      id: 'new-default',
      isDefault: true,
    });
    const repo = new VisitSourcesRepository(prisma as never);

    const result = await repo.ensureDefaultSource('biz-1');

    expect(visitSource.create).toHaveBeenCalledTimes(1);
    const arg = visitSource.create.mock.calls[0][0] as {
      data: { businessId: string; isDefault: boolean; token: string };
    };
    expect(arg.data.businessId).toBe('biz-1');
    expect(arg.data.isDefault).toBe(true);
    expect(typeof arg.data.token).toBe('string');
    expect(arg.data.token.length).toBeGreaterThan(0);
    expect(result).toEqual({ id: 'new-default', isDefault: true });
  });

  it('recovers from a concurrent create race (P2002) by re-reading', async () => {
    const { prisma, visitSource } = makePrisma();
    // First findFirst: none. create races and loses. Second findFirst: the
    // winner's row.
    visitSource.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'raced-default', isDefault: true });
    visitSource.create.mockRejectedValue(p2002());
    const repo = new VisitSourcesRepository(prisma as never);

    const result = await repo.ensureDefaultSource('biz-1');

    expect(result).toEqual({ id: 'raced-default', isDefault: true });
    expect(visitSource.findFirst).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-P2002 errors', async () => {
    const { prisma, visitSource } = makePrisma();
    visitSource.findFirst.mockResolvedValueOnce(null);
    visitSource.create.mockRejectedValue(new Error('db down'));
    const repo = new VisitSourcesRepository(prisma as never);

    await expect(repo.ensureDefaultSource('biz-1')).rejects.toThrow('db down');
  });
});
