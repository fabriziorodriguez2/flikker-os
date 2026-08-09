import { AiUsageService } from './ai-usage.service';

const NOW = new Date('2026-09-15T12:00:00.000Z');

function makeDeps(
  options: { dailyCount?: number; monthlyCount?: number } = {},
) {
  const prisma = {
    aiUsageEvent: {
      count: jest
        .fn()
        .mockResolvedValueOnce(options.dailyCount ?? 0)
        .mockResolvedValueOnce(options.monthlyCount ?? 0),
      create: jest.fn().mockResolvedValue({ id: 'usage-1' }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
  const config = {
    maxDailyGenerationsPerBusiness: 10,
    maxMonthlyGenerationsPerBusiness: 100,
  };
  return { prisma, config };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new AiUsageService(deps.prisma as never, deps.config as never);
}

describe('AiUsageService — Fase F §6: daily/monthly caps', () => {
  it('has capacity when under both caps', async () => {
    const deps = makeDeps({ dailyCount: 2, monthlyCount: 20 });
    const service = makeService(deps);

    expect(await service.hasCapacity('biz-1', NOW)).toBe(true);
  });

  it('has no capacity once the daily cap is reached', async () => {
    const deps = makeDeps({ dailyCount: 10, monthlyCount: 20 });
    const service = makeService(deps);

    expect(await service.hasCapacity('biz-1', NOW)).toBe(false);
  });

  it('has no capacity once the monthly cap is reached, even with daily headroom', async () => {
    const deps = makeDeps({ dailyCount: 1, monthlyCount: 100 });
    const service = makeService(deps);

    expect(await service.hasCapacity('biz-1', NOW)).toBe(false);
  });
});

describe('AiUsageService — recording (Fase F §6/§43: no PII)', () => {
  it('records a usage event with only the allowed fields', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const id = await service.record({
      businessId: 'biz-1',
      useCase: 'RETENTION_MESSAGE',
      model: 'gpt-4o-mini',
      promptVersion: 'v1',
      success: true,
      fallbackUsed: false,
      inputTokens: 50,
      outputTokens: 20,
      latencyMs: 300,
    });

    expect(id).toBe('usage-1');
    expect(deps.prisma.aiUsageEvent.create).toHaveBeenCalledWith({
      data: {
        businessId: 'biz-1',
        useCase: 'RETENTION_MESSAGE',
        model: 'gpt-4o-mini',
        promptVersion: 'v1',
        success: true,
        fallbackUsed: false,
        inputTokens: 50,
        outputTokens: 20,
        latencyMs: 300,
        customerId: null,
      },
      select: { id: true },
    });
  });

  it('never throws when the write fails — usage logging is best-effort', async () => {
    const deps = makeDeps();
    deps.prisma.aiUsageEvent.create.mockRejectedValueOnce(new Error('db down'));
    const service = makeService(deps);

    const id = await service.record({
      businessId: 'biz-1',
      useCase: 'RETENTION_MESSAGE',
      model: 'gpt-4o-mini',
      promptVersion: 'v1',
      success: false,
      fallbackUsed: true,
    });

    expect(id).toBeNull();
  });
});
