import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CustomerEventType } from '@prisma/client';
import { RedemptionService } from './redemption.service';

function makeDeps(
  options: {
    rewardGoal?: unknown;
    membership?: { role: string; status: string } | null;
  } = {},
) {
  const prisma = {
    business: {
      findUnique: jest.fn().mockResolvedValue({
        timezone: 'America/Montevideo',
        experienceVersion: 'CHECKIN_V2',
      }),
    },
    membership: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.membership === undefined
            ? { role: 'OWNER', status: 'ACTIVE' }
            : options.membership,
        ),
    },
    customerRewardGoal: {
      findFirst: jest.fn().mockResolvedValue(options.rewardGoal ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const benefits = {
    consumeRedemption: jest.fn(),
    previewRedemption: jest.fn().mockResolvedValue({
      status: 'ok',
      businessId: 'biz-1',
      benefitTitle: '10% off',
      customerName: 'Ana',
    }),
    attachRedeemedVisit: jest.fn().mockResolvedValue(undefined),
  };
  const visits = {
    registerRedemptionVisit: jest.fn().mockResolvedValue({ id: 'visit-1' }),
  };
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  const decisions = { record: jest.fn().mockResolvedValue(undefined) };
  return { prisma, benefits, visits, events, decisions };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RedemptionService(
    deps.prisma as never,
    deps.benefits as never,
    deps.visits as never,
    deps.events as never,
    deps.decisions as never,
  );
}

function okConsumption(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok' as const,
    businessId: 'biz-1',
    participationId: 'p-1',
    benefitId: 'b-1',
    customerId: 'c-1',
    benefitTitle: '10% off',
    benefitType: 'discount',
    customerName: 'Ana',
    ...overrides,
  };
}

describe('RedemptionService', () => {
  it('redeems a valid code: registers the visit, links it, emits the event', async () => {
    const deps = makeDeps();
    deps.benefits.consumeRedemption.mockResolvedValue({
      status: 'ok',
      businessId: 'biz-1',
      participationId: 'p-1',
      benefitId: 'b-1',
      customerId: 'c-1',
      benefitTitle: '10% off',
      benefitType: 'discount',
      customerName: 'Ana',
    });
    const service = makeService(deps);

    const result = await service.redeem('user-1', ' abcd1234 ');

    // Code is normalized (trim + uppercase) before consuming.
    expect(deps.benefits.consumeRedemption).toHaveBeenCalledWith(
      'ABCD1234',
      'user-1',
    );
    expect(deps.visits.registerRedemptionVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'c-1',
        benefitId: 'b-1',
        participationId: 'p-1',
      }),
    );
    expect(deps.benefits.attachRedeemedVisit).toHaveBeenCalledWith(
      'p-1',
      'visit-1',
    );
    expect(deps.events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CustomerEventType.benefit_redeemed,
        visitId: 'visit-1',
      }),
    );
    expect(result).toEqual({
      ok: true,
      customerName: 'Ana',
      benefitTitle: '10% off',
      visitId: 'visit-1',
    });
  });

  it('throws NotFound for an unknown code and never touches visits', async () => {
    const deps = makeDeps();
    deps.benefits.previewRedemption.mockResolvedValue({ status: 'not_found' });
    const service = makeService(deps);

    await expect(service.redeem('user-1', 'XXXX')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deps.benefits.consumeRedemption).not.toHaveBeenCalled();
    expect(deps.visits.registerRedemptionVisit).not.toHaveBeenCalled();
  });

  it('throws Conflict for an already-redeemed code (no double canje)', async () => {
    const deps = makeDeps();
    deps.benefits.previewRedemption.mockResolvedValue({
      status: 'already',
      businessId: 'biz-1',
    });
    deps.benefits.consumeRedemption.mockResolvedValue({
      status: 'already',
      businessId: 'biz-1',
    });
    const service = makeService(deps);

    await expect(service.redeem('user-1', 'ABCD1234')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(deps.visits.registerRedemptionVisit).not.toHaveBeenCalled();
    expect(deps.events.emit).not.toHaveBeenCalled();
  });

  it('throws Conflict for an expired code, never registers a visit', async () => {
    const deps = makeDeps();
    deps.benefits.previewRedemption.mockResolvedValue({
      status: 'expired',
      businessId: 'biz-1',
    });
    deps.benefits.consumeRedemption.mockResolvedValue({
      status: 'expired',
      businessId: 'biz-1',
    });
    const service = makeService(deps);

    await expect(service.redeem('user-1', 'ABCD1234')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(deps.visits.registerRedemptionVisit).not.toHaveBeenCalled();
  });

  it('ajuste "canje por URL" — resuelve el negocio del propio código, sin depender de un negocio "activo"', async () => {
    const deps = makeDeps();
    deps.benefits.previewRedemption.mockResolvedValue({
      status: 'ok',
      businessId: 'biz-OTHER',
      benefitTitle: '10% off',
      customerName: 'Ana',
    });
    deps.benefits.consumeRedemption.mockResolvedValue(
      okConsumption({ businessId: 'biz-OTHER' }),
    );
    const service = makeService(deps);

    await service.redeem('user-1', 'ABCD1234');

    // El chequeo de membership se hace contra el negocio del CÓDIGO
    // (biz-OTHER), nunca contra un businessId pasado por el caller.
    expect(deps.prisma.membership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_businessId: { userId: 'user-1', businessId: 'biz-OTHER' },
        },
      }),
    );
    expect(deps.visits.registerRedemptionVisit).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-OTHER' }),
    );
  });

  it('rechaza con NotFound (no Forbidden) si el empleado no tiene NINGUNA membership en el negocio del código, y nunca consume', async () => {
    // Hardening #4 — mismo 404 genérico que un código inexistente: alguien
    // sin ninguna relación con ese negocio no puede distinguir "código de
    // otro negocio" de "código inexistente" a partir de la respuesta.
    const deps = makeDeps({ membership: null });
    const service = makeService(deps);

    await expect(service.redeem('user-1', 'ABCD1234')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deps.benefits.consumeRedemption).not.toHaveBeenCalled();
  });

  it('rechaza con Forbidden si la membership existe pero está inactiva', async () => {
    const deps = makeDeps({ membership: { role: 'OWNER', status: 'REMOVED' } });
    const service = makeService(deps);

    await expect(service.redeem('user-1', 'ABCD1234')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(deps.benefits.consumeRedemption).not.toHaveBeenCalled();
  });

  it('rechaza con Forbidden si el rol no es OWNER/ADMIN/OPERATOR (ej. VIEWER)', async () => {
    const deps = makeDeps({ membership: { role: 'VIEWER', status: 'ACTIVE' } });
    const service = makeService(deps);

    await expect(service.redeem('user-1', 'ABCD1234')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(deps.benefits.consumeRedemption).not.toHaveBeenCalled();
  });

  it('LEGACY (negocio del código, no uno "activo") es rechazado igual que antes', async () => {
    const deps = makeDeps();
    deps.prisma.business.findUnique.mockResolvedValue({
      experienceVersion: 'LEGACY',
    });
    const service = makeService(deps);

    await expect(service.redeem('user-1', 'ABCD1234')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deps.benefits.consumeRedemption).not.toHaveBeenCalled();
  });
});

describe('RedemptionService.preview — canje por URL', () => {
  it('returns benefitTitle/customerName without consuming anything', async () => {
    const deps = makeDeps();
    deps.benefits.previewRedemption.mockResolvedValue({
      status: 'ok',
      businessId: 'biz-1',
      benefitTitle: 'Capuccino gratis',
      customerName: 'Ana',
    });
    const service = makeService(deps);

    const result = await service.preview('user-1', ' abcd1234 ');

    expect(deps.benefits.previewRedemption).toHaveBeenCalledWith('ABCD1234');
    expect(deps.benefits.consumeRedemption).not.toHaveBeenCalled();
    expect(result).toEqual({
      benefitTitle: 'Capuccino gratis',
      customerName: 'Ana',
    });
  });

  it('throws NotFound for an unknown code', async () => {
    const deps = makeDeps();
    deps.benefits.previewRedemption.mockResolvedValue({ status: 'not_found' });
    const service = makeService(deps);

    await expect(service.preview('user-1', 'XXXX')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws Conflict for an already-redeemed code', async () => {
    const deps = makeDeps();
    deps.benefits.previewRedemption.mockResolvedValue({
      status: 'already',
      businessId: 'biz-1',
    });
    const service = makeService(deps);

    await expect(service.preview('user-1', 'ABCD1234')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws Conflict for an expired code', async () => {
    const deps = makeDeps();
    deps.benefits.previewRedemption.mockResolvedValue({
      status: 'expired',
      businessId: 'biz-1',
    });
    const service = makeService(deps);

    await expect(service.preview('user-1', 'ABCD1234')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a LEGACY business the same way redeem does', async () => {
    const deps = makeDeps();
    deps.prisma.business.findUnique.mockResolvedValue({
      experienceVersion: 'LEGACY',
    });
    const service = makeService(deps);

    await expect(service.preview('user-1', 'ABCD1234')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rechaza con NotFound — nunca revela already/expired ni Forbidden — si el empleado no tiene NINGUNA membership en ese negocio', async () => {
    const deps = makeDeps({ membership: null });
    deps.benefits.previewRedemption.mockResolvedValue({
      status: 'already',
      businessId: 'biz-1',
    });
    const service = makeService(deps);

    await expect(service.preview('user-1', 'ABCD1234')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('código inexistente y código de otro negocio (sin membership ahí) son indistinguibles: mismo NotFound con el mismo mensaje', async () => {
    const notFoundDeps = makeDeps({ membership: null });
    notFoundDeps.benefits.previewRedemption.mockResolvedValue({
      status: 'not_found',
    });
    const notFoundService = makeService(notFoundDeps);

    const foreignDeps = makeDeps({ membership: null });
    foreignDeps.benefits.previewRedemption.mockResolvedValue({
      status: 'ok',
      businessId: 'biz-OTHER',
      benefitTitle: 'Capuccino gratis',
      customerName: 'Ana',
    });
    const foreignService = makeService(foreignDeps);

    const [notFoundError, foreignError] = await Promise.all([
      notFoundService.preview('user-1', 'AAAA1111').catch((e: unknown) => e),
      foreignService.preview('user-1', 'BBBB2222').catch((e: unknown) => e),
    ]);

    expect(notFoundError).toBeInstanceOf(NotFoundException);
    expect(foreignError).toBeInstanceOf(NotFoundException);
    expect((notFoundError as NotFoundException).message).toBe(
      (foreignError as NotFoundException).message,
    );
    expect((notFoundError as NotFoundException).getStatus()).toBe(
      (foreignError as NotFoundException).getStatus(),
    );
  });
});

describe('RedemptionService — Reward Goal REDEEMED wiring (Fase F §0.2)', () => {
  it('closes an UNLOCKED reward goal to REDEEMED when its own BenefitParticipation is redeemed', async () => {
    const deps = makeDeps({
      rewardGoal: { id: 'goal-1', businessId: 'biz-1', customerId: 'c-1' },
    });
    deps.benefits.consumeRedemption.mockResolvedValue(okConsumption());
    const service = makeService(deps);

    await service.redeem('user-1', 'ABCD1234');

    expect(deps.prisma.customerRewardGoal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { benefitParticipationId: 'p-1', status: 'UNLOCKED' },
      }),
    );
    expect(deps.prisma.customerRewardGoal.updateMany).toHaveBeenCalledWith({
      where: { id: 'goal-1', status: 'UNLOCKED' },
      data: { status: 'REDEEMED', redeemedAt: expect.any(Date) },
    });
    expect(deps.decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'c-1',
        decisionCode: 'REWARD_GOAL_REDEEMED',
        metadata: { goalId: 'goal-1', participationId: 'p-1' },
      }),
    );
  });

  it('leaves ordinary (non-reward-goal) redemptions completely unchanged', async () => {
    const deps = makeDeps({ rewardGoal: null });
    deps.benefits.consumeRedemption.mockResolvedValue(okConsumption());
    const service = makeService(deps);

    const result = await service.redeem('user-1', 'ABCD1234');

    expect(deps.prisma.customerRewardGoal.updateMany).not.toHaveBeenCalled();
    expect(deps.decisions.record).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('is idempotent: a goal already closed by a concurrent redeem attempt is not double-logged', async () => {
    const deps = makeDeps({
      rewardGoal: { id: 'goal-1', businessId: 'biz-1', customerId: 'c-1' },
    });
    deps.prisma.customerRewardGoal.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    deps.benefits.consumeRedemption.mockResolvedValue(okConsumption());
    const service = makeService(deps);

    await service.redeem('user-1', 'ABCD1234');

    expect(deps.decisions.record).not.toHaveBeenCalled();
  });

  it('never issues or touches a BenefitParticipation while closing the goal', async () => {
    const deps = makeDeps({
      rewardGoal: { id: 'goal-1', businessId: 'biz-1', customerId: 'c-1' },
    });
    deps.benefits.consumeRedemption.mockResolvedValue(okConsumption());
    const service = makeService(deps);

    await service.redeem('user-1', 'ABCD1234');

    // attachRedeemedVisit is the one legitimate write to the redemption
    // itself, already asserted elsewhere — nothing else on `benefits` is
    // ever called from the reward-goal-closing path.
    expect(deps.benefits.attachRedeemedVisit).toHaveBeenCalledTimes(1);
  });
});
