import { AiGateService } from './ai-gate.service';
import { AI_USE_CASES } from './ai-usecases';

function makeDeps(
  options: {
    globallyEnabled?: boolean;
    providerConfigured?: boolean;
    business?: { aiCopyEnabled?: boolean; aiInsightsEnabled?: boolean } | null;
    hasCapacity?: boolean;
  } = {},
) {
  const prisma = {
    retentionSettings: {
      findUnique: jest.fn().mockResolvedValue(
        options.business === null
          ? null
          : {
              aiCopyEnabled: options.business?.aiCopyEnabled ?? true,
              aiInsightsEnabled: options.business?.aiInsightsEnabled ?? true,
            },
      ),
    },
  };
  const config = {
    globallyEnabled: options.globallyEnabled ?? true,
    providerConfigured: options.providerConfigured ?? true,
  };
  const usage = {
    hasCapacity: jest.fn().mockResolvedValue(options.hasCapacity ?? true),
  };
  return { prisma, config, usage };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new AiGateService(
    deps.prisma as never,
    deps.config as never,
    deps.usage as never,
  );
}

describe('AiGateService — Fase F §5: platform kill switch wins over everything', () => {
  it('denies when the platform switch is off, even if the business opted in', async () => {
    const deps = makeDeps({ globallyEnabled: false });
    const service = makeService(deps);

    const decision = await service.check(
      'biz-1',
      AI_USE_CASES.RETENTION_MESSAGE,
    );

    expect(decision).toEqual({
      allowed: false,
      reasonCode: 'PLATFORM_DISABLED',
    });
    // Never even queries settings — cheapest check first.
    expect(deps.prisma.retentionSettings.findUnique).not.toHaveBeenCalled();
  });

  it('denies when the platform is on but no provider is configured', async () => {
    const deps = makeDeps({ providerConfigured: false });
    const service = makeService(deps);

    const decision = await service.check(
      'biz-1',
      AI_USE_CASES.RETENTION_MESSAGE,
    );

    expect(decision).toEqual({
      allowed: false,
      reasonCode: 'PROVIDER_NOT_CONFIGURED',
    });
  });
});

describe('AiGateService — per-business opt-in, per use case category', () => {
  it('denies a message use case when aiCopyEnabled is false', async () => {
    const deps = makeDeps({
      business: { aiCopyEnabled: false, aiInsightsEnabled: true },
    });
    const service = makeService(deps);

    const decision = await service.check(
      'biz-1',
      AI_USE_CASES.RETENTION_MESSAGE,
    );

    expect(decision).toEqual({
      allowed: false,
      reasonCode: 'BUSINESS_DISABLED',
    });
  });

  it('denies an explanation use case when aiInsightsEnabled is false, even with aiCopyEnabled true', async () => {
    const deps = makeDeps({
      business: { aiCopyEnabled: true, aiInsightsEnabled: false },
    });
    const service = makeService(deps);

    const decision = await service.check(
      'biz-1',
      AI_USE_CASES.RECOMMENDATION_EXPLANATION,
    );

    expect(decision).toEqual({
      allowed: false,
      reasonCode: 'BUSINESS_DISABLED',
    });
  });

  it('allows a message use case when aiCopyEnabled is true and everything else is green', async () => {
    const deps = makeDeps({ business: { aiCopyEnabled: true } });
    const service = makeService(deps);

    const decision = await service.check(
      'biz-1',
      AI_USE_CASES.PROGRESS_REMINDER_MESSAGE,
    );

    expect(decision).toEqual({ allowed: true });
  });

  it('denies when the business no longer exists', async () => {
    const deps = makeDeps({ business: null });
    const service = makeService(deps);

    const decision = await service.check(
      'biz-1',
      AI_USE_CASES.RETENTION_MESSAGE,
    );

    expect(decision).toEqual({
      allowed: false,
      reasonCode: 'BUSINESS_DISABLED',
    });
  });
});

describe('AiGateService — usage caps', () => {
  it('denies once the usage cap is reached, even with everything else allowed', async () => {
    const deps = makeDeps({ hasCapacity: false });
    const service = makeService(deps);

    const decision = await service.check(
      'biz-1',
      AI_USE_CASES.RETENTION_MESSAGE,
    );

    expect(decision).toEqual({
      allowed: false,
      reasonCode: 'DAILY_OR_MONTHLY_CAP_REACHED',
    });
  });
});
