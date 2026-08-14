import { BadRequestException } from '@nestjs/common';
import { RetentionSettingsService } from './retention-settings.service';

function makeService(settingsOverrides: Record<string, unknown> = {}) {
  const prisma = {
    retentionSettings: {
      findUnique: jest.fn().mockResolvedValue({
        maxAutomatedIncentivesPerMonth: null,
        maxEstimatedIncentiveCostPerMonth: null,
        ...settingsOverrides,
      }),
      create: jest.fn(),
    },
  };
  return new RetentionSettingsService(prisma as never);
}

describe('RetentionSettingsService.hasIncentiveBudgetConfigured', () => {
  const service = makeService();

  it('false cuando ambos caps son null — el caso "no configurado" real', () => {
    expect(
      service.hasIncentiveBudgetConfigured({
        maxAutomatedIncentivesPerMonth: null,
        maxEstimatedIncentiveCostPerMonth: null,
      }),
    ).toBe(false);
  });

  it('true con solo el cap de cantidad', () => {
    expect(
      service.hasIncentiveBudgetConfigured({
        maxAutomatedIncentivesPerMonth: 10,
        maxEstimatedIncentiveCostPerMonth: null,
      }),
    ).toBe(true);
  });

  it('true con solo el cap monetario', () => {
    expect(
      service.hasIncentiveBudgetConfigured({
        maxAutomatedIncentivesPerMonth: null,
        maxEstimatedIncentiveCostPerMonth: 5000 as never,
      }),
    ).toBe(true);
  });

  it('true con ambos', () => {
    expect(
      service.hasIncentiveBudgetConfigured({
        maxAutomatedIncentivesPerMonth: 10,
        maxEstimatedIncentiveCostPerMonth: 5000 as never,
      }),
    ).toBe(true);
  });
});

describe('RetentionSettingsService.assertBudgetReadyToAuthorize', () => {
  it('rechaza cuando no hay ningún cap y no se propone uno', async () => {
    const service = makeService();
    await expect(
      service.assertBudgetReadyToAuthorize('biz-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('permite cuando ya hay un cap de cantidad configurado', async () => {
    const service = makeService({ maxAutomatedIncentivesPerMonth: 10 });
    await expect(
      service.assertBudgetReadyToAuthorize('biz-1'),
    ).resolves.toBeUndefined();
  });

  it('permite cuando ya hay un cap monetario configurado (sin tocar el de cantidad)', async () => {
    const service = makeService({ maxEstimatedIncentiveCostPerMonth: 3000 });
    await expect(
      service.assertBudgetReadyToAuthorize('biz-1'),
    ).resolves.toBeUndefined();
  });

  it('permite cuando se propone un límite en la misma llamada, aunque la DB todavía no lo tenga', async () => {
    const service = makeService(); // ambos null en DB
    await expect(
      service.assertBudgetReadyToAuthorize('biz-1', 10),
    ).resolves.toBeUndefined();
  });
});
