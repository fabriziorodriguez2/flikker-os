import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BenefitType } from '@prisma/client';
import { BenefitsService } from './benefits.service';
import type { BenefitsRepository } from './benefits.repository';

// Plain object of jest mocks (not typed as the class) so eslint's unbound-method
// rule doesn't flag the assertions below. Cast to the repo type only at the seam.
function makeRepo() {
  return {
    findMany: jest.fn(),
    findActive: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setActive: jest.fn(),
    remove: jest.fn(),
    findParticipants: jest.fn(),
    registerParticipation: jest.fn(),
  };
}

function makeService(repo: ReturnType<typeof makeRepo>) {
  return new BenefitsService(repo as unknown as BenefitsRepository);
}

describe('BenefitsService', () => {
  it('create parses ISO dates and forwards the active flag', async () => {
    const repo = makeRepo();
    repo.create.mockResolvedValue({ id: 'b1' });
    const service = makeService(repo);

    await service.create('biz-1', {
      type: BenefitType.discount,
      title: '2x1',
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T00:00:00.000Z',
      active: true,
    });

    expect(repo.create).toHaveBeenCalledWith('biz-1', {
      type: BenefitType.discount,
      title: '2x1',
      description: undefined,
      terms: undefined,
      recurrence: undefined,
      active: true,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-31T00:00:00.000Z'),
    });
  });

  it('create rejects when endDate is before startDate', async () => {
    const repo = makeRepo();
    const service = makeService(repo);

    await expect(
      service.create('biz-1', {
        type: BenefitType.promotion,
        title: 'x',
        startDate: '2026-08-31T00:00:00.000Z',
        endDate: '2026-08-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('getOne throws NotFound for a benefit outside the tenant', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue(null);
    const service = makeService(repo);

    await expect(service.getOne('biz-1', 'other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update throws NotFound when repository reports no scoped row', async () => {
    const repo = makeRepo();
    repo.update.mockResolvedValue(null);
    const service = makeService(repo);

    await expect(
      service.update('biz-1', 'b1', { title: 'new' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('activate throws NotFound when repository reports no scoped row', async () => {
    const repo = makeRepo();
    repo.setActive.mockResolvedValue(null);
    const service = makeService(repo);

    await expect(service.activate('biz-1', 'b1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.setActive).toHaveBeenCalledWith('biz-1', 'b1', true);
  });

  it('getParticipants verifies tenant ownership before listing', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue({ id: 'b1' });
    repo.findParticipants.mockResolvedValue([]);
    const service = makeService(repo);

    await service.getParticipants('biz-1', 'b1');

    expect(repo.findOne).toHaveBeenCalledWith('biz-1', 'b1');
    expect(repo.findParticipants).toHaveBeenCalledWith('biz-1', 'b1');
  });

  it('getParticipants throws NotFound when the benefit is not the tenant’s', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue(null);
    const service = makeService(repo);

    await expect(
      service.getParticipants('biz-1', 'foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findParticipants).not.toHaveBeenCalled();
  });
});
