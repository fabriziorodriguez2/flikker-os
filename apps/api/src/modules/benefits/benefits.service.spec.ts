import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BenefitIssuanceSource, BenefitType } from '@prisma/client';
import { BenefitsService } from './benefits.service';
import type { BenefitsRepository } from './benefits.repository';
import type { ProgramAuditService } from '../program-audit/program-audit.service';
import type { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import type { RetentionV2BootstrapService } from '../retention-v2/retention-v2-bootstrap.service';
import type { PlansService } from '../plans/plans.service';

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
    countLiveGoalsForDefinition: jest.fn().mockResolvedValue(0),
    findRedemption: jest.fn(),
    findAvailableParticipations: jest.fn().mockResolvedValue([]),
  };
}

function makeProgramAudit() {
  return { record: jest.fn().mockResolvedValue({}) };
}

// Defaults to "budget is ready" so every existing test here — about the
// bridge write itself, not about budgeting — keeps passing unmodified. The
// guard's own behaviour is covered by its dedicated describe block below.
function makeRetentionSettings() {
  return {
    assertBudgetReadyToAuthorize: jest.fn().mockResolvedValue(undefined),
    // Default "catálogo prendido" — el gate de `benefitsEnabled` tiene su
    // propio describe block más abajo.
    getOrCreate: jest.fn().mockResolvedValue({ benefitsEnabled: true }),
  };
}

function makeRetentionBootstrap() {
  return { ensureDefaultRetentionSetup: jest.fn().mockResolvedValue([]) };
}

// Defaults to "nunca bloqueado" so every existing test here keeps passing
// unmodified — el gate de trial de Beneficios tiene su propio describe block.
function makePlans() {
  return {
    assertBenefitsProActionAllowed: jest.fn().mockResolvedValue(undefined),
    isBenefitsBlocked: jest.fn().mockResolvedValue(false),
  };
}

function makeService(
  repo: ReturnType<typeof makeRepo>,
  programAudit: ReturnType<typeof makeProgramAudit> = makeProgramAudit(),
  retentionSettings: ReturnType<
    typeof makeRetentionSettings
  > = makeRetentionSettings(),
  retentionBootstrap: ReturnType<
    typeof makeRetentionBootstrap
  > = makeRetentionBootstrap(),
  plans: ReturnType<typeof makePlans> = makePlans(),
) {
  return new BenefitsService(
    repo as unknown as BenefitsRepository,
    programAudit as unknown as ProgramAuditService,
    retentionSettings as unknown as RetentionSettingsService,
    retentionBootstrap as unknown as RetentionV2BootstrapService,
    plans as unknown as PlansService,
  );
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

describe('BenefitsService.setRetentionBridge — presupuesto (fase de budget)', () => {
  function makeAuthorizeAttempt(
    overrides: { wasAutomationEligible?: boolean } = {},
  ) {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Café gratis',
      retentionIncentiveDefinition: overrides.wasAutomationEligible
        ? { automationEligible: true, rewardGoalEligible: false }
        : null,
    });
    repo.setRetentionBridge.mockResolvedValue({
      automationEligible: true,
      rewardGoalEligible: false,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: null,
    });
    return repo;
  }

  it('rechaza autorizar (false→true) sin presupuesto configurado, sin escribir nada', async () => {
    const repo = makeAuthorizeAttempt();
    const retentionSettings = {
      assertBudgetReadyToAuthorize: jest
        .fn()
        .mockRejectedValue(new Error('Configurá un límite mensual')),
      getOrCreate: jest.fn(),
    };
    const service = makeService(repo, makeProgramAudit(), retentionSettings);

    await expect(
      service.setRetentionBridge('biz-1', 'b1', { recoveryEnabled: true }),
    ).rejects.toThrow('Configurá un límite mensual');
    expect(repo.setRetentionBridge).not.toHaveBeenCalled();
  });

  it('permite autorizar cuando el presupuesto ya está configurado', async () => {
    const repo = makeAuthorizeAttempt();
    const service = makeService(repo); // default: guard resuelve OK

    await expect(
      service.setRetentionBridge('biz-1', 'b1', { recoveryEnabled: true }),
    ).resolves.toBeDefined();
    expect(repo.setRetentionBridge).toHaveBeenCalled();
  });

  it('no vuelve a chequear presupuesto si ya estaba autorizado (no es una transición)', async () => {
    const repo = makeAuthorizeAttempt({ wasAutomationEligible: true });
    const retentionSettings = {
      assertBudgetReadyToAuthorize: jest.fn(),
      getOrCreate: jest.fn(),
    };
    const service = makeService(repo, makeProgramAudit(), retentionSettings);

    await service.setRetentionBridge('biz-1', 'b1', { recoveryEnabled: true });

    expect(
      retentionSettings.assertBudgetReadyToAuthorize,
    ).not.toHaveBeenCalled();
  });

  it('desautorizar (true→false) nunca necesita presupuesto', async () => {
    const repo = makeAuthorizeAttempt({ wasAutomationEligible: true });
    repo.setRetentionBridge.mockResolvedValue({
      automationEligible: false,
      rewardGoalEligible: false,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: null,
    });
    const retentionSettings = {
      assertBudgetReadyToAuthorize: jest.fn(),
      getOrCreate: jest.fn(),
    };
    const service = makeService(repo, makeProgramAudit(), retentionSettings);

    await service.setRetentionBridge('biz-1', 'b1', { recoveryEnabled: false });

    expect(
      retentionSettings.assertBudgetReadyToAuthorize,
    ).not.toHaveBeenCalled();
  });

  it('§12 — dispara el mismo bootstrap que Notificaciones cuando la autorización realmente cambia', async () => {
    const repo = makeAuthorizeAttempt();
    const retentionBootstrap = {
      ensureDefaultRetentionSetup: jest.fn().mockResolvedValue([]),
    };
    const service = makeService(
      repo,
      makeProgramAudit(),
      makeRetentionSettings(),
      retentionBootstrap,
    );

    await service.setRetentionBridge('biz-1', 'b1', { recoveryEnabled: true });

    expect(retentionBootstrap.ensureDefaultRetentionSetup).toHaveBeenCalledWith(
      'biz-1',
    );
  });

  it('no dispara bootstrap si recoveryEnabled no viene en el patch (solo rewardGoalEnabled, por ejemplo)', async () => {
    const repo = makeAuthorizeAttempt({ wasAutomationEligible: true });
    repo.setRetentionBridge.mockResolvedValue({
      automationEligible: true,
      rewardGoalEligible: true,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: null,
    });
    const retentionBootstrap = {
      ensureDefaultRetentionSetup: jest.fn().mockResolvedValue([]),
    };
    const service = makeService(
      repo,
      makeProgramAudit(),
      makeRetentionSettings(),
      retentionBootstrap,
    );

    await service.setRetentionBridge('biz-1', 'b1', {
      rewardGoalEnabled: true,
    });

    expect(
      retentionBootstrap.ensureDefaultRetentionSetup,
    ).not.toHaveBeenCalled();
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

  it('Historial: autorizar reactivación (false→true) queda auditado', async () => {
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
    const audit = makeProgramAudit();
    const service = makeService(repo, audit);

    await service.setRetentionBridge(
      'biz-1',
      'b1',
      { recoveryEnabled: true },
      'user-1',
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        actorUserId: 'user-1',
        type: 'benefit_reactivation_authorized',
      }),
    );
  });

  it('Historial: reafirmar el mismo valor NO genera un evento nuevo', async () => {
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
        estimatedCost: null,
      },
    });
    repo.setRetentionBridge.mockResolvedValue({
      automationEligible: true,
      rewardGoalEligible: false,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: null,
    });
    const audit = makeProgramAudit();
    const service = makeService(repo, audit);

    await service.setRetentionBridge('biz-1', 'b1', { recoveryEnabled: true });

    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('BenefitsService — "no cambiar una promesa que ya tiene un cliente"', () => {
  const BRIDGED = {
    id: 'b1',
    type: BenefitType.gift,
    title: 'Café gratis',
    retentionIncentiveDefinition: {
      id: 'def-1',
      automationEligible: false,
      rewardGoalEligible: true,
      percentageValue: null,
      fixedValue: null,
      estimatedCost: null,
    },
  };

  it('rewardGoalEligible + 0 goals vivos → edición permitida', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue(BRIDGED);
    repo.countLiveGoalsForDefinition.mockResolvedValue(0);
    repo.update.mockResolvedValue({ id: 'b1', title: '2x1' });
    const service = makeService(repo);

    await service.update('biz-1', 'b1', { title: '2x1' });

    expect(repo.countLiveGoalsForDefinition).toHaveBeenCalledWith(
      'biz-1',
      'def-1',
    );
    expect(repo.update).toHaveBeenCalled();
  });

  it('ACTIVE → bloqueada', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue(BRIDGED);
    repo.countLiveGoalsForDefinition.mockResolvedValue(1); // simula 1 ACTIVE
    const service = makeService(repo);

    await expect(
      service.update('biz-1', 'b1', { title: '2x1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('UNLOCKED → bloqueada', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue(BRIDGED);
    repo.countLiveGoalsForDefinition.mockResolvedValue(1); // simula 1 UNLOCKED
    const service = makeService(repo);

    await expect(
      service.update('biz-1', 'b1', { type: BenefitType.discount }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('solo REDEEMED/EXPIRED/CANCELLED (0 vivos) → NO bloquea el catálogo actual', async () => {
    // El repo real filtra por status ACTIVE/UNLOCKED — un negocio con solo
    // goals cerrados ve `countLiveGoalsForDefinition` en 0, igual que uno sin
    // ningún goal. Este test fija esa expectativa del lado del service.
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue(BRIDGED);
    repo.countLiveGoalsForDefinition.mockResolvedValue(0);
    repo.update.mockResolvedValue({ id: 'b1', title: '2x1' });
    const service = makeService(repo);

    await service.update('biz-1', 'b1', { title: '2x1' });

    expect(repo.update).toHaveBeenCalled();
  });

  it('sin ningún bridge (nunca fue recompensa de nada) → permite sin ni siquiera contar goals', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Café gratis',
      retentionIncentiveDefinition: null,
    });
    repo.update.mockResolvedValue({ id: 'b1', title: '2x1' });
    const service = makeService(repo);

    await service.update('biz-1', 'b1', { title: '2x1' });

    expect(repo.countLiveGoalsForDefinition).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalled();
  });

  it('permite editar campos que NO son título/tipo aunque haya goals vivos', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue(BRIDGED);
    repo.update.mockResolvedValue({ id: 'b1', title: 'Café gratis' });
    const service = makeService(repo);

    await service.update('biz-1', 'b1', { description: 'Nuevo texto' });

    expect(repo.findRetentionBridge).not.toHaveBeenCalled();
    expect(repo.countLiveGoalsForDefinition).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalled();
  });

  it('registra la auditoría al editar cuando la edición sí procede', async () => {
    const repo = makeRepo();
    repo.findRetentionBridge.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Café gratis',
      retentionIncentiveDefinition: null,
    });
    repo.update.mockResolvedValue({ id: 'b1', title: 'Nuevo nombre' });
    const audit = makeProgramAudit();
    const service = makeService(repo, audit);

    await service.update('biz-1', 'b1', { title: 'Nuevo nombre' }, 'user-1');

    expect(repo.update).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'benefit_edited',
        actorUserId: 'user-1',
      }),
    );
  });

  describe('trial de 30 días (self-service Beneficios) — guard centralizado en PlansService', () => {
    it('create rechaza con 403 cuando el trial venció (PlansService lo bloquea)', async () => {
      const repo = makeRepo();
      const plans = makePlans();
      plans.assertBenefitsProActionAllowed.mockRejectedValue(
        new ForbiddenException(
          'Tu prueba de 30 días terminó. Actualizá tu plan para seguir usando funciones Pro de Beneficios.',
        ),
      );
      const service = makeService(repo, undefined, undefined, undefined, plans);

      await expect(
        service.create('biz-1', { type: BenefitType.gift, title: 'x' }),
      ).rejects.toThrow(/prueba de 30 días/);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('create sigue funcionando normalmente sin Subscription (LEGACY/Platform Admin)', async () => {
      const repo = makeRepo();
      repo.create.mockResolvedValue({ id: 'b1' });
      const plans = makePlans(); // assertBenefitsProActionAllowed: nunca bloquea por default
      const service = makeService(repo, undefined, undefined, undefined, plans);

      await service.create('biz-1', { type: BenefitType.gift, title: 'x' });

      expect(repo.create).toHaveBeenCalled();
      expect(plans.assertBenefitsProActionAllowed).toHaveBeenCalledWith(
        'biz-1',
      );
    });
  });

  describe('reactivación (recoveryEnabled) — autorizar NUEVA reactivación es una acción Pro de Beneficios', () => {
    function makeAuthorizeAttempt() {
      const repo = makeRepo();
      repo.findRetentionBridge.mockResolvedValue({
        title: 'Café gratis',
        retentionIncentiveDefinition: { automationEligible: false },
      });
      repo.setRetentionBridge.mockResolvedValue({
        automationEligible: true,
        rewardGoalEligible: false,
        percentageValue: null,
        fixedValue: null,
        estimatedCost: null,
      });
      return repo;
    }

    it('rechaza autorizar reactivación con el trial vencido, sin llegar a chequear presupuesto', async () => {
      const repo = makeAuthorizeAttempt();
      const plans = makePlans();
      plans.assertBenefitsProActionAllowed.mockRejectedValue(
        new ForbiddenException('Tu prueba de 30 días terminó.'),
      );
      const retentionSettings = makeRetentionSettings();
      const service = makeService(
        repo,
        undefined,
        retentionSettings,
        undefined,
        plans,
      );

      await expect(
        service.setRetentionBridge('biz-1', 'b1', { recoveryEnabled: true }),
      ).rejects.toThrow(/prueba de 30 días/);
      expect(repo.setRetentionBridge).not.toHaveBeenCalled();
      expect(
        retentionSettings.assertBudgetReadyToAuthorize,
      ).not.toHaveBeenCalled();
    });

    it('permite autorizar reactivación cuando NO está bloqueado (Pro, o trial vigente)', async () => {
      const repo = makeAuthorizeAttempt();
      const plans = makePlans();
      const service = makeService(repo, undefined, undefined, undefined, plans);

      await service.setRetentionBridge('biz-1', 'b1', {
        recoveryEnabled: true,
      });

      expect(plans.assertBenefitsProActionAllowed).toHaveBeenCalledWith(
        'biz-1',
      );
      expect(repo.setRetentionBridge).toHaveBeenCalled();
    });

    it('desautorizar (true→false) nunca pasa por el guard Pro — nunca borra ni bloquea apagar', async () => {
      const repo = makeRepo();
      repo.findRetentionBridge.mockResolvedValue({
        title: 'Café gratis',
        retentionIncentiveDefinition: { automationEligible: true },
      });
      repo.setRetentionBridge.mockResolvedValue({
        automationEligible: false,
        rewardGoalEligible: false,
        percentageValue: null,
        fixedValue: null,
        estimatedCost: null,
      });
      const plans = makePlans();
      const service = makeService(repo, undefined, undefined, undefined, plans);

      await service.setRetentionBridge('biz-1', 'b1', {
        recoveryEnabled: false,
      });

      expect(plans.assertBenefitsProActionAllowed).not.toHaveBeenCalled();
    });

    it('re-autorizar lo que ya estaba autorizado (no es una transición) tampoco pasa por el guard', async () => {
      const repo = makeRepo();
      repo.findRetentionBridge.mockResolvedValue({
        title: 'Café gratis',
        retentionIncentiveDefinition: { automationEligible: true },
      });
      repo.setRetentionBridge.mockResolvedValue({
        automationEligible: true,
        rewardGoalEligible: false,
        percentageValue: null,
        fixedValue: null,
        estimatedCost: null,
      });
      const plans = makePlans();
      const service = makeService(repo, undefined, undefined, undefined, plans);

      await service.setRetentionBridge('biz-1', 'b1', {
        recoveryEnabled: true,
      });

      expect(plans.assertBenefitsProActionAllowed).not.toHaveBeenCalled();
    });
  });

  describe('capacidad independiente de sellos: catálogo de Beneficios (Programa → Configuración)', () => {
    it('resolveActiveBenefit no muestra nada con benefitsEnabled: false, sin tocar el catálogo', async () => {
      const repo = makeRepo();
      const retentionSettings = {
        ...makeRetentionSettings(),
        getOrCreate: jest.fn().mockResolvedValue({ benefitsEnabled: false }),
      };
      const service = makeService(repo, undefined, retentionSettings);

      const result = await service.resolveActiveBenefit('biz-1');

      expect(result).toBeNull();
      // Ni siquiera se consulta el beneficio activo — apagado significa
      // "no mostrar nada", nunca "borrar o desactivar el catálogo".
      expect(repo.findActive).not.toHaveBeenCalled();
    });

    it('resolveActiveBenefit sigue funcionando igual con benefitsEnabled: true (default)', async () => {
      const repo = makeRepo();
      repo.findActive.mockResolvedValue({
        id: 'ben-1',
        type: BenefitType.gift,
        startDate: null,
        endDate: null,
      });
      const service = makeService(repo);

      const result = await service.resolveActiveBenefit('biz-1');

      expect(result).toMatchObject({ id: 'ben-1' });
    });

    /**
     * Edge case auditado (pedido explícito): con Beneficios apagado, una
     * promoción manual no puede seguir siendo visible/canjeable para el
     * cliente vía `getOtherAvailableBenefits` — mismo toggle que ya frena
     * `resolveActiveBenefit`/`grantWelcomeGift`/`getWelcomeGiftState`.
     */
    it('getOtherAvailableBenefits no muestra nada con benefitsEnabled: false', async () => {
      const repo = makeRepo();
      const retentionSettings = {
        ...makeRetentionSettings(),
        getOrCreate: jest.fn().mockResolvedValue({ benefitsEnabled: false }),
      };
      const service = makeService(repo, undefined, retentionSettings);

      const result = await service.getOtherAvailableBenefits(
        'biz-1',
        'cus-1',
        [],
      );

      expect(result).toEqual([]);
      expect(repo.findAvailableParticipations).not.toHaveBeenCalled();
    });

    it('getOtherAvailableBenefits sigue funcionando igual con benefitsEnabled: true (default)', async () => {
      const repo = makeRepo();
      repo.findAvailableParticipations.mockResolvedValue([
        {
          benefitId: 'ben-2',
          redemptionCode: 'CODE-2',
          expiresAt: null,
          benefitTitleSnapshot: null,
          benefit: {
            type: BenefitType.gift,
            title: '2x1',
            description: null,
            terms: null,
          },
        },
      ]);
      const service = makeService(repo);

      const result = await service.getOtherAvailableBenefits('biz-1', 'cus-1', [
        'ben-1',
        null,
        undefined,
      ]);

      expect(repo.findAvailableParticipations).toHaveBeenCalledWith(
        'biz-1',
        'cus-1',
        ['ben-1'],
        expect.any(Date),
      );
      expect(result).toMatchObject([{ benefitId: 'ben-2', title: '2x1' }]);
    });

    it('assertBenefitsCatalogEnabled tira BadRequestException con benefitsEnabled: false', async () => {
      const repo = makeRepo();
      const retentionSettings = {
        ...makeRetentionSettings(),
        getOrCreate: jest.fn().mockResolvedValue({ benefitsEnabled: false }),
      };
      const service = makeService(repo, undefined, retentionSettings);

      await expect(
        service.assertBenefitsCatalogEnabled('biz-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('assertBenefitsCatalogEnabled no tira nada con benefitsEnabled: true (default)', async () => {
      const repo = makeRepo();
      const service = makeService(repo);

      await expect(
        service.assertBenefitsCatalogEnabled('biz-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('trial de Beneficios vencido (sin Pro) — resolveActiveBenefit', () => {
    function activeBenefit() {
      return {
        id: 'ben-1',
        type: BenefitType.gift,
        startDate: null,
        endDate: null,
      };
    }

    it('cliente SIN una promesa previa no ve una oferta nueva', async () => {
      const repo = makeRepo();
      repo.findActive.mockResolvedValue(activeBenefit());
      repo.findRedemption.mockResolvedValue(null);
      const plans = {
        ...makePlans(),
        isBenefitsBlocked: jest.fn().mockResolvedValue(true),
      };
      const service = makeService(repo, undefined, undefined, undefined, plans);

      const result = await service.resolveActiveBenefit(
        'biz-1',
        new Date(),
        'cust-1',
      );

      expect(result).toBeNull();
    });

    it('sin customerId (anónimo / registro) tampoco ve una oferta nueva', async () => {
      const repo = makeRepo();
      repo.findActive.mockResolvedValue(activeBenefit());
      const plans = {
        ...makePlans(),
        isBenefitsBlocked: jest.fn().mockResolvedValue(true),
      };
      const service = makeService(repo, undefined, undefined, undefined, plans);

      const result = await service.resolveActiveBenefit('biz-1');

      expect(result).toBeNull();
      expect(repo.findRedemption).not.toHaveBeenCalled();
    });

    it('CLIENTE TEST clave: uno con una BenefitParticipation previa (código ya emitido) sigue viendo y pudiendo canjear su beneficio', async () => {
      const repo = makeRepo();
      repo.findActive.mockResolvedValue(activeBenefit());
      repo.findRedemption.mockResolvedValue({
        redemptionCode: 'ABCD1234',
        redeemedAt: null,
      });
      const plans = {
        ...makePlans(),
        isBenefitsBlocked: jest.fn().mockResolvedValue(true),
      };
      const service = makeService(repo, undefined, undefined, undefined, plans);

      const result = await service.resolveActiveBenefit(
        'biz-1',
        new Date(),
        'cust-1',
      );

      expect(result).toMatchObject({ id: 'ben-1' });
      expect(repo.findRedemption).toHaveBeenCalledWith(
        'biz-1',
        'ben-1',
        'cust-1',
        BenefitIssuanceSource.CHECKIN_ACTIVE,
      );
    });

    it('sin bloqueo, ni siquiera se consulta si existe una promesa previa', async () => {
      const repo = makeRepo();
      repo.findActive.mockResolvedValue(activeBenefit());
      const service = makeService(repo);

      await service.resolveActiveBenefit('biz-1', new Date(), 'cust-1');

      expect(repo.findRedemption).not.toHaveBeenCalled();
    });
  });
});

/**
 * El "Eliminar" de Programa → Beneficios ya no siempre borra. Un beneficio
 * que se emitió alguna vez se RETIRA: deja de ofrecerse y de enviarse, pero
 * sus `BenefitParticipation` sobreviven. Borrarlo se las llevaba por
 * `onDelete: Cascade` — así se perdió en producción el canje de un
 * `CustomerRewardGoal` que quedó en REDEEMED sin emisión.
 */
describe('BenefitsService.remove — retirar vs borrar', () => {
  it('sin emisiones: se borra y la respuesta lo dice', async () => {
    const repo = makeRepo();
    repo.remove.mockResolvedValue({ status: 'deleted' });

    const result = await makeService(repo).remove('biz-1', 'b1');

    expect(result).toMatchObject({ ok: true, deleted: true, retired: false });
  });

  it('con una emisión canjeada: retira, y el mensaje habla de historial', async () => {
    const repo = makeRepo();
    repo.remove.mockResolvedValue({
      status: 'retired',
      participations: 3,
      redeemed: 2,
    });

    const result = (await makeService(repo).remove('biz-1', 'b1')) as {
      deleted: boolean;
      retired: boolean;
      redeemed: number;
      message: string;
    };

    expect(result.deleted).toBe(false);
    expect(result.retired).toBe(true);
    expect(result.redeemed).toBe(2);
    expect(result.message).toContain('historial');
  });

  it('con una emisión pendiente: retira, y el mensaje habla del cliente que ya la tiene', async () => {
    const repo = makeRepo();
    repo.remove.mockResolvedValue({
      status: 'retired',
      participations: 1,
      redeemed: 0,
    });

    const result = (await makeService(repo).remove('biz-1', 'b1')) as {
      retired: boolean;
      message: string;
    };

    expect(result.retired).toBe(true);
    expect(result.message).toContain('todavía no lo canjearon');
  });

  it('un id que el repositorio no resuelve (incluido un carrier) es 404', async () => {
    const repo = makeRepo();
    repo.remove.mockResolvedValue({ status: 'not_found' });

    await expect(
      makeService(repo).remove('biz-1', 'carrier-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
