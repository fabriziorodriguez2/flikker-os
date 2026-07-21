import { BadRequestException } from '@nestjs/common';
import { RetentionService } from './retention.service';
import type { RetentionRepository } from './retention.repository';

function makeRepo() {
  return {
    findByBusiness: jest.fn(),
    save: jest.fn(),
  };
}

function makeService(repo: ReturnType<typeof makeRepo>) {
  return new RetentionService(repo as unknown as RetentionRepository);
}

describe('RetentionService', () => {
  it('get returns an empty disabled sequence when none exists', async () => {
    const repo = makeRepo();
    repo.findByBusiness.mockResolvedValue(null);
    const service = makeService(repo);

    await expect(service.get('biz-1')).resolves.toEqual({
      enabled: false,
      steps: [],
    });
  });

  it('get returns the persisted sequence', async () => {
    const repo = makeRepo();
    repo.findByBusiness.mockResolvedValue({
      enabled: true,
      steps: [{ id: 's1', offsetDays: 20, messageBody: 'Hola' }],
    });
    const service = makeService(repo);

    await expect(service.get('biz-1')).resolves.toEqual({
      enabled: true,
      steps: [{ id: 's1', offsetDays: 20, messageBody: 'Hola' }],
    });
  });

  it('save rejects duplicate offsets', async () => {
    const repo = makeRepo();
    const service = makeService(repo);

    await expect(
      service.save('biz-1', {
        enabled: true,
        steps: [
          { offsetDays: 20, messageBody: 'a' },
          { offsetDays: 20, messageBody: 'b' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('save trims bodies and sorts steps by offset before persisting', async () => {
    const repo = makeRepo();
    repo.save.mockResolvedValue({
      enabled: true,
      steps: [
        { id: 's1', offsetDays: 20, messageBody: 'primero' },
        { id: 's2', offsetDays: 45, messageBody: 'segundo' },
      ],
    });
    const service = makeService(repo);

    await service.save('biz-1', {
      enabled: true,
      steps: [
        { offsetDays: 45, messageBody: '  segundo  ' },
        { offsetDays: 20, messageBody: 'primero' },
      ],
    });

    expect(repo.save).toHaveBeenCalledWith('biz-1', true, [
      { offsetDays: 20, messageBody: 'primero' },
      { offsetDays: 45, messageBody: 'segundo' },
    ]);
  });
});
