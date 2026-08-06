import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VisitSourceType } from '@prisma/client';
import { VisitSourcesService } from './visit-sources.service';
import type { VisitSourcesRepository } from './visit-sources.repository';

// Plain object of jest mocks (not typed as the class) so eslint's unbound-method
// rule doesn't flag the assertions below. Cast to the repo type only at the seam.
function makeRepo() {
  return {
    findMany: jest.fn(),
    findOne: jest.fn(),
    findByToken: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    countVisits: jest.fn(),
    ensureDefaultSource: jest.fn(),
    isCheckinV2Business: jest.fn().mockResolvedValue(true),
  };
}

function makeService(repo: ReturnType<typeof makeRepo>) {
  return new VisitSourcesService(repo as unknown as VisitSourcesRepository);
}

describe('VisitSourcesService', () => {
  it('list ensures the default source exists before returning', async () => {
    const repo = makeRepo();
    repo.ensureDefaultSource.mockResolvedValue({ id: 'default' });
    repo.findMany.mockResolvedValue([{ id: 'default', isDefault: true }]);
    const service = makeService(repo);

    const result = await service.list('biz-1');

    expect(repo.ensureDefaultSource).toHaveBeenCalledWith('biz-1');
    expect(repo.findMany).toHaveBeenCalledWith('biz-1');
    expect(result).toHaveLength(1);
  });

  it('create trims the name and forwards the type', async () => {
    const repo = makeRepo();
    repo.create.mockResolvedValue({ id: 's1' });
    const service = makeService(repo);

    await service.create('biz-1', {
      name: '  Mostrador  ',
      type: VisitSourceType.nfc,
    });

    expect(repo.create).toHaveBeenCalledWith('biz-1', {
      name: 'Mostrador',
      type: VisitSourceType.nfc,
    });
  });

  it('getOne throws NotFound for a source outside the tenant', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue(null);
    const service = makeService(repo);

    await expect(service.getOne('biz-1', 'foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update throws NotFound when repository reports no scoped row', async () => {
    const repo = makeRepo();
    repo.update.mockResolvedValue(null);
    const service = makeService(repo);

    await expect(
      service.update('biz-1', 's1', { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove refuses to delete the default source', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue({ id: 's1', isDefault: true });
    const service = makeService(repo);

    await expect(service.remove('biz-1', 's1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('remove refuses to delete a source that has visits', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue({ id: 's1', isDefault: false });
    repo.countVisits.mockResolvedValue(3);
    const service = makeService(repo);

    await expect(service.remove('biz-1', 's1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('remove deletes a non-default source with no visits', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue({ id: 's1', isDefault: false });
    repo.countVisits.mockResolvedValue(0);
    repo.remove.mockResolvedValue(true);
    const service = makeService(repo);

    await expect(service.remove('biz-1', 's1')).resolves.toEqual({ ok: true });
    expect(repo.remove).toHaveBeenCalledWith('biz-1', 's1');
  });
});
