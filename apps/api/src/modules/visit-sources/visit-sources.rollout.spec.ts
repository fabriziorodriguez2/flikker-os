import { ExperienceVersion } from '@prisma/client';
import { VisitSourcesService } from './visit-sources.service';
import { VisitSourcesRepository } from './visit-sources.repository';

function makeRepo(isV2: boolean) {
  return {
    isCheckinV2Business: jest.fn().mockResolvedValue(isV2),
    ensureDefaultSource: jest.fn().mockResolvedValue({ id: 'default' }),
    findMany: jest.fn().mockResolvedValue([]),
  };
}

describe('VisitSourcesService.list — rollout', () => {
  it('LEGACY: never lazily creates a VisitSource', async () => {
    const repo = makeRepo(false);
    const service = new VisitSourcesService(
      repo as unknown as VisitSourcesRepository,
    );

    await service.list('biz-1');

    // Before the rollout flag, merely opening this view created a default
    // source for any business — including legacy ones.
    expect(repo.ensureDefaultSource).not.toHaveBeenCalled();
  });

  it('LEGACY: still lists rows that already exist, leaving them inert', async () => {
    const repo = makeRepo(false);
    repo.findMany.mockResolvedValue([{ id: 'orphan', isDefault: true }]);
    const service = new VisitSourcesService(
      repo as unknown as VisitSourcesRepository,
    );

    const result = await service.list('biz-1');

    // Pre-existing rows are never deleted by the rollout.
    expect(result).toHaveLength(1);
  });

  it('CHECKIN_V2: keeps the idempotent lazy creation', async () => {
    const repo = makeRepo(true);
    const service = new VisitSourcesService(
      repo as unknown as VisitSourcesRepository,
    );

    await service.list('biz-1');

    expect(repo.ensureDefaultSource).toHaveBeenCalledWith('biz-1');
  });
});

describe('VisitSourcesRepository.isCheckinV2Business', () => {
  function makePrisma(experienceVersion: ExperienceVersion | null) {
    return {
      business: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            experienceVersion === null ? null : { experienceVersion },
          ),
      },
    };
  }

  it('is true for CHECKIN_V2', async () => {
    const repo = new VisitSourcesRepository(
      makePrisma(ExperienceVersion.CHECKIN_V2) as never,
    );
    await expect(repo.isCheckinV2Business('biz-1')).resolves.toBe(true);
  });

  it('is false for LEGACY and for a missing business', async () => {
    const legacy = new VisitSourcesRepository(
      makePrisma(ExperienceVersion.LEGACY) as never,
    );
    await expect(legacy.isCheckinV2Business('biz-1')).resolves.toBe(false);

    const missing = new VisitSourcesRepository(makePrisma(null) as never);
    await expect(missing.isCheckinV2Business('ghost')).resolves.toBe(false);
  });
});
