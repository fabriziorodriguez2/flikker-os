import { ConflictException, NotFoundException } from '@nestjs/common';
import { OptimizationMode, SimulationScenario } from '@prisma/client';
import { SimulationService } from './simulation.service';

function makeDeps(
  configOverrides: Partial<{
    available: boolean;
    enabled: boolean;
    databaseUrl: string | null;
    unavailableReason: 'DISABLED' | 'DATABASE_NOT_CONFIGURED' | null;
    maxConcurrentRuns: number;
    maxCustomers: number;
    maxDays: number;
  }> = {},
  runs: unknown[] = [],
) {
  const config = {
    available: false,
    enabled: false,
    databaseUrl: null,
    unavailableReason: 'DISABLED' as const,
    maxConcurrentRuns: 1,
    maxCustomers: 1000,
    maxDays: 90,
    ...configOverrides,
  };
  const repository = {
    list: jest.fn().mockResolvedValue(runs),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'run-1' }),
    countActive: jest.fn().mockResolvedValue(0),
    requestCancel: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const queue = {
    enqueue: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };
  return { config, repository, queue };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new SimulationService(
    deps.config as never,
    deps.repository as never,
    deps.queue as never,
  );
}

describe('SimulationService — §25/§42: status never requires a real simulation database', () => {
  it('reports DISABLED when the kill switch is off', () => {
    const deps = makeDeps({
      available: false,
      enabled: false,
      unavailableReason: 'DISABLED',
    });
    const service = makeService(deps);

    const status = service.getStatus();

    expect(status.available).toBe(false);
    expect(status.enabled).toBe(false);
    expect(status.databaseConfigured).toBe(false);
    expect(status.unavailableReason).toBe('DISABLED');
  });

  it('reports DATABASE_NOT_CONFIGURED when enabled but no simulation DB is set', () => {
    const deps = makeDeps({
      available: false,
      enabled: true,
      databaseUrl: null,
      unavailableReason: 'DATABASE_NOT_CONFIGURED',
    });
    const service = makeService(deps);

    const status = service.getStatus();

    expect(status.available).toBe(false);
    expect(status.enabled).toBe(true);
    expect(status.unavailableReason).toBe('DATABASE_NOT_CONFIGURED');
  });

  it('reports available once both the switch and the database are configured', () => {
    const deps = makeDeps({
      available: true,
      enabled: true,
      databaseUrl: 'postgresql://sim:sim@localhost:5432/sim',
      unavailableReason: null,
    });
    const service = makeService(deps);

    const status = service.getStatus();

    expect(status.available).toBe(true);
    expect(status.databaseConfigured).toBe(true);
    expect(status.unavailableReason).toBeNull();
  });

  it('surfaces the configured limits so the panel can enforce them client-side too', () => {
    const deps = makeDeps({
      maxConcurrentRuns: 3,
      maxCustomers: 250,
      maxDays: 30,
    });
    const service = makeService(deps);

    const status = service.getStatus();

    expect(status.maxConcurrentRuns).toBe(3);
    expect(status.maxCustomers).toBe(250);
    expect(status.maxDays).toBe(30);
  });
});

describe('SimulationService.listRuns — bookkeeping only, no simulated business data', () => {
  it('delegates to the repository and returns whatever it finds', async () => {
    const runs = [{ id: 'run-1', status: 'COMPLETED' }];
    const deps = makeDeps({}, runs);
    const service = makeService(deps);

    const result = await service.listRuns();

    expect(result).toBe(runs);
    expect(deps.repository.list).toHaveBeenCalled();
  });

  it('returns an empty list when no simulations have run yet', async () => {
    const deps = makeDeps({}, []);
    const service = makeService(deps);

    expect(await service.listRuns()).toEqual([]);
  });
});

describe('SimulationService.getRun', () => {
  it('throws NotFoundException when the run does not exist', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    await expect(service.getRun('missing')).rejects.toThrow(NotFoundException);
  });

  it('returns the run when it exists', async () => {
    const deps = makeDeps();
    deps.repository.findOne.mockResolvedValue({ id: 'run-1' });
    const service = makeService(deps);
    expect(await service.getRun('run-1')).toEqual({ id: 'run-1' });
  });
});

describe('SimulationService.createRun — §25/§26/§27', () => {
  const dto = { scenario: SimulationScenario.BASELINE_HEALTHY };

  it('refuses to create a run when the environment is not available', async () => {
    const deps = makeDeps({ available: false });
    const service = makeService(deps);
    await expect(service.createRun('user-1', dto)).rejects.toThrow(
      ConflictException,
    );
    expect(deps.repository.create).not.toHaveBeenCalled();
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });

  it('refuses to create a run once the concurrency ceiling is reached', async () => {
    const deps = makeDeps({ available: true, maxConcurrentRuns: 1 });
    deps.repository.countActive.mockResolvedValue(1);
    const service = makeService(deps);
    await expect(service.createRun('user-1', dto)).rejects.toThrow(
      ConflictException,
    );
    expect(deps.repository.create).not.toHaveBeenCalled();
  });

  it('creates the row and enqueues it when everything is available', async () => {
    const deps = makeDeps({ available: true, maxConcurrentRuns: 2 });
    deps.repository.countActive.mockResolvedValue(0);
    deps.repository.create.mockResolvedValue({ id: 'run-42' });
    const service = makeService(deps);

    const result = await service.createRun('user-1', dto);

    expect(result).toEqual({ id: 'run-42' });
    expect(deps.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario: SimulationScenario.BASELINE_HEALTHY,
        createdByUserId: 'user-1',
      }),
    );
    expect(deps.queue.enqueue).toHaveBeenCalledWith('run-42');
  });

  it('clamps days/customerCount overrides to the configured limits before persisting', async () => {
    const deps = makeDeps({
      available: true,
      maxConcurrentRuns: 2,
      maxDays: 10,
      maxCustomers: 50,
    });
    const service = makeService(deps);

    await service.createRun('user-1', {
      scenario: SimulationScenario.BASELINE_HEALTHY,
      days: 999,
      customerCount: 999,
    });

    expect(deps.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ days: 10, customerCount: 50 }),
    );
  });

  it('passes optimizationMode overrides through into the stored configuration', async () => {
    const deps = makeDeps({ available: true, maxConcurrentRuns: 2 });
    const service = makeService(deps);

    await service.createRun('user-1', {
      scenario: SimulationScenario.BASELINE_HEALTHY,
      optimizationMode: OptimizationMode.AUTOMATIC,
    });

    const call = deps.repository.create.mock.calls[0][0];
    expect(
      (call.configuration as { business: { optimizationMode: string } })
        .business.optimizationMode,
    ).toBe(OptimizationMode.AUTOMATIC);
  });
});

describe('SimulationService.cancelRun — §28', () => {
  it('requests cancellation when the run is still PENDING/RUNNING', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const result = await service.cancelRun('run-1');
    expect(result).toEqual({ cancelRequested: true });
    expect(deps.repository.requestCancel).toHaveBeenCalledWith('run-1');
  });

  it('throws NotFoundException when the run does not exist or already finished', async () => {
    const deps = makeDeps();
    deps.repository.requestCancel.mockResolvedValue({ count: 0 });
    const service = makeService(deps);
    await expect(service.cancelRun('run-1')).rejects.toThrow(NotFoundException);
  });
});
