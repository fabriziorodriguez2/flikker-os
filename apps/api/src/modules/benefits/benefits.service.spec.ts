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
    findLatestDraw: jest.fn(),
    findRetentionBridge: jest.fn(),
    setRetentionBridge: jest.fn(),
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

  it('list attaches lastDraw only to raffle-type benefits', async () => {
    const repo = makeRepo();
    repo.findMany.mockResolvedValue([
      { id: 'b1', type: BenefitType.raffle },
      { id: 'b2', type: BenefitType.discount },
    ]);
    repo.findLatestDraw.mockResolvedValue({
      periodKey: '2026-07',
      participantsCount: 4,
      drawnAt: new Date('2026-07-31T23:50:00Z'),
      winner: { name: 'Igor', phoneE164: '+59892180837' },
    });
    const service = makeService(repo);

    const result = await service.list('biz-1');

    expect(repo.findLatestDraw).toHaveBeenCalledWith('b1');
    expect(repo.findLatestDraw).not.toHaveBeenCalledWith('b2');
    expect(result[0].lastDraw).toEqual({
      winnerName: 'Igor',
      winnerPhone: '+59892180837',
      participantsCount: 4,
      periodKey: '2026-07',
      drawnAt: new Date('2026-07-31T23:50:00Z'),
    });
    expect(result[1].lastDraw).toBeNull();
  });

  it('list sets lastDraw to null for a raffle with no draws yet', async () => {
    const repo = makeRepo();
    repo.findMany.mockResolvedValue([{ id: 'b1', type: BenefitType.raffle }]);
    repo.findLatestDraw.mockResolvedValue(null);
    const service = makeService(repo);

    const result = await service.list('biz-1');

    expect(result[0].lastDraw).toBeNull();
  });

  it('list exposes deny-by-default retentionBridge for a legacy benefit with no bridge yet', async () => {
    const repo = makeRepo();
    repo.findMany.mockResolvedValue([
      {
        id: 'b1',
        type: BenefitType.discount,
        retentionIncentiveDefinition: null,
      },
    ]);
    const service = makeService(repo);

    const result = await service.list('biz-1');

    expect(result[0].retentionBridge).toEqual({
      recoveryEnabled: false,
      rewardGoalEnabled: false,
      hasKnownValue: false,
    });
    // The raw relation never leaks to the frontend.
    expect(result[0]).not.toHaveProperty('retentionIncentiveDefinition');
  });
});

describe('BenefitsService.setRetentionBridge — puente Benefit ↔ RetentionIncentiveDefinition', () => {
  it('create Benefit, then enable recovery with a cost — creates/authorizes the bridge', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
      retentionIncentiveDefinition: null,
    });
    repo.setRetentionBridge.mockResolvedValue({
      automationEligible: true,
      rewardGoalEligible: false,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: 50,
    });
    const service = makeService(repo);

    const result = await service.setRetentionBridge('biz-1', 'b1', {
      recoveryEnabled: true,
      estimatedCost: 50,
    });

    expect(repo.setRetentionBridge).toHaveBeenCalledWith('biz-1', 'b1', {
      automationEligible: true,
      rewardGoalEligible: undefined,
      estimatedCost: 50,
    });
    expect(result).toEqual({
      recoveryEnabled: true,
      rewardGoalEnabled: false,
      hasKnownValue: true,
    });
  });

  it('Piloto V2 (#2, revertido) — enables recovery with NO known value at all; cost is never required to authorize', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
      retentionIncentiveDefinition: null,
    });
    repo.setRetentionBridge.mockResolvedValue({
      automationEligible: true,
      rewardGoalEligible: false,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: null,
    });
    const service = makeService(repo);

    const result = await service.setRetentionBridge('biz-1', 'b1', {
      recoveryEnabled: true,
    });

    expect(repo.setRetentionBridge).toHaveBeenCalledWith('biz-1', 'b1', {
      automationEligible: true,
      rewardGoalEligible: undefined,
      estimatedCost: undefined,
    });
    expect(result).toEqual({
      recoveryEnabled: true,
      rewardGoalEnabled: false,
      // La economía queda "no disponible" — nunca bloquea la autorización.
      hasKnownValue: false,
    });
  });

  it('enables recovery without asking for a cost again once one is already known', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
      retentionIncentiveDefinition: {
        id: 'def-1',
        automationEligible: false,
        rewardGoalEligible: false,
        percentageValue: null,
        fixedValue: null,
        estimatedCost: 50,
      },
    });
    repo.setRetentionBridge.mockResolvedValue({
      automationEligible: true,
      rewardGoalEligible: false,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: 50,
    });
    const service = makeService(repo);

    await service.setRetentionBridge('biz-1', 'b1', { recoveryEnabled: true });

    expect(repo.setRetentionBridge).toHaveBeenCalledWith('biz-1', 'b1', {
      automationEligible: true,
      rewardGoalEligible: undefined,
      estimatedCost: undefined,
    });
  });

  it('enable reward — no cost required at all', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
      retentionIncentiveDefinition: null,
    });
    repo.setRetentionBridge.mockResolvedValue({
      automationEligible: false,
      rewardGoalEligible: true,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: null,
    });
    const service = makeService(repo);

    const result = await service.setRetentionBridge('biz-1', 'b1', {
      rewardGoalEnabled: true,
    });

    expect(repo.setRetentionBridge).toHaveBeenCalledWith('biz-1', 'b1', {
      automationEligible: undefined,
      rewardGoalEligible: true,
      estimatedCost: undefined,
    });
    expect(result.rewardGoalEnabled).toBe(true);
    expect(result.recoveryEnabled).toBe(false);
  });

  it('enable both recovery and reward together, with a cost provided', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
      retentionIncentiveDefinition: null,
    });
    repo.setRetentionBridge.mockResolvedValue({
      automationEligible: true,
      rewardGoalEligible: true,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: 50,
    });
    const service = makeService(repo);

    const result = await service.setRetentionBridge('biz-1', 'b1', {
      recoveryEnabled: true,
      rewardGoalEnabled: true,
      estimatedCost: 50,
    });

    expect(result).toEqual({
      recoveryEnabled: true,
      rewardGoalEnabled: true,
      hasKnownValue: true,
    });
  });

  it('disable recovery — never needs a cost, never deletes anything', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
      retentionIncentiveDefinition: {
        id: 'def-1',
        automationEligible: true,
        rewardGoalEligible: false,
        percentageValue: null,
        fixedValue: null,
        estimatedCost: 50,
      },
    });
    repo.setRetentionBridge.mockResolvedValue({
      automationEligible: false,
      rewardGoalEligible: false,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: 50,
    });
    const service = makeService(repo);

    const result = await service.setRetentionBridge('biz-1', 'b1', {
      recoveryEnabled: false,
    });

    expect(result.recoveryEnabled).toBe(false);
    // The value itself is preserved — hasKnownValue stays true so
    // re-enabling later never asks for the cost again.
    expect(result.hasKnownValue).toBe(true);
  });

  it('disable reward independently of recovery', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
      retentionIncentiveDefinition: {
        id: 'def-1',
        automationEligible: true,
        rewardGoalEligible: true,
        percentageValue: null,
        fixedValue: null,
        estimatedCost: 50,
      },
    });
    repo.setRetentionBridge.mockResolvedValue({
      automationEligible: true,
      rewardGoalEligible: false,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: 50,
    });
    const service = makeService(repo);

    const result = await service.setRetentionBridge('biz-1', 'b1', {
      rewardGoalEnabled: false,
    });

    expect(result.rewardGoalEnabled).toBe(false);
    expect(result.recoveryEnabled).toBe(true);
  });

  it('scopes to the correct tenant — 404s instead of touching another business’s benefit', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue(null);
    const service = makeService(repo);

    await expect(
      service.setRetentionBridge('biz-1', 'foreign', { recoveryEnabled: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.setRetentionBridge).not.toHaveBeenCalled();
  });
});
