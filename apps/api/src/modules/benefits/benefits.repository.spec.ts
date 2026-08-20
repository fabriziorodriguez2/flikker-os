import { BenefitIssuanceSource, BenefitType, Prisma } from '@prisma/client';
import { BenefitsRepository } from './benefits.repository';

// Builds a fake Prisma whose $transaction just runs the callback with `tx`.
function makePrisma() {
  const tx = {
    benefit: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'b1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    retentionIncentiveDefinition: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'def-1' }),
      update: jest.fn().mockResolvedValue({ id: 'def-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    benefit: tx.benefit,
    retentionIncentiveDefinition: tx.retentionIncentiveDefinition,
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

describe('BenefitsRepository single-active invariant', () => {
  it('create deactivates other active benefits when active=true', async () => {
    const { prisma, tx } = makePrisma();
    const repo = new BenefitsRepository(prisma as never);

    await repo.create('biz-1', {
      type: BenefitType.gift,
      title: 'Café gratis',
      active: true,
    });

    expect(tx.benefit.updateMany).toHaveBeenCalledWith({
      where: { businessId: 'biz-1', active: true },
      data: { active: false },
    });
    expect(tx.benefit.create).toHaveBeenCalled();
  });

  it('create does not deactivate others when active=false', async () => {
    const { prisma, tx } = makePrisma();
    const repo = new BenefitsRepository(prisma as never);

    await repo.create('biz-1', {
      type: BenefitType.gift,
      title: 'Café gratis',
      active: false,
    });

    expect(tx.benefit.updateMany).not.toHaveBeenCalled();
  });

  it('setActive(true) deactivates every other active benefit except the target', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({ id: 'b1' });
    const repo = new BenefitsRepository(prisma as never);

    await repo.setActive('biz-1', 'b1', true);

    expect(tx.benefit.updateMany).toHaveBeenCalledWith({
      where: { businessId: 'biz-1', active: true, id: { not: 'b1' } },
      data: { active: false },
    });
    expect(tx.benefit.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { active: true },
    });
  });

  it('setActive returns null when the benefit is not the tenant’s', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.setActive('biz-1', 'foreign', true);

    expect(result).toBeNull();
    expect(tx.benefit.update).not.toHaveBeenCalled();
  });
});

describe('BenefitsRepository — pre-piloto #2: solo remove() desautoriza el bridge', () => {
  it('setActive(false) no toca el bridge — varios beneficios pueden quedar autorizados aunque solo uno esté activo', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({ id: 'b1' });
    const repo = new BenefitsRepository(prisma as never);

    await repo.setActive('biz-1', 'b1', false);

    expect(tx.retentionIncentiveDefinition.updateMany).not.toHaveBeenCalled();
  });

  it('update(active: false) tampoco desautoriza el bridge', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({ id: 'b1' });
    const repo = new BenefitsRepository(prisma as never);

    await repo.update('biz-1', 'b1', { active: false });

    expect(tx.retentionIncentiveDefinition.updateMany).not.toHaveBeenCalled();
  });

  it('remove (borrado real) sí deauthorizes the bridge before deleting the Benefit', async () => {
    const { prisma, tx } = makePrisma();
    const repo = new BenefitsRepository(prisma as never);

    const callOrder: string[] = [];
    tx.retentionIncentiveDefinition.updateMany.mockImplementation(() => {
      callOrder.push('deauthorize');
      return Promise.resolve({ count: 1 });
    });
    tx.benefit.deleteMany.mockImplementation(() => {
      callOrder.push('delete');
      return Promise.resolve({ count: 1 });
    });

    const result = await repo.remove('biz-1', 'b1');

    expect(result).toBe(true);
    expect(callOrder).toEqual(['deauthorize', 'delete']);
    expect(tx.retentionIncentiveDefinition.updateMany).toHaveBeenCalledWith({
      where: { benefitId: 'b1' },
      data: { automationEligible: false, rewardGoalEligible: false },
    });
  });
});

describe('BenefitsRepository.setRetentionBridge', () => {
  it('returns null when the benefit is not the tenant’s', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.setRetentionBridge('biz-1', 'foreign', {
      automationEligible: true,
      estimatedCost: 50,
    });

    expect(result).toBeNull();
    expect(tx.retentionIncentiveDefinition.create).not.toHaveBeenCalled();
  });

  it('creates the bridge definition on first activation, snapshotting name/type from the Benefit', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
    });
    tx.retentionIncentiveDefinition.findUnique.mockResolvedValue(null);
    tx.retentionIncentiveDefinition.create.mockResolvedValue({
      id: 'def-1',
      automationEligible: false,
      rewardGoalEligible: false,
    });
    const repo = new BenefitsRepository(prisma as never);

    await repo.setRetentionBridge('biz-1', 'b1', {
      automationEligible: true,
      estimatedCost: 50,
    });

    expect(tx.retentionIncentiveDefinition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          businessId: 'biz-1',
          benefitId: 'b1',
          name: 'Capuccino gratis',
          type: BenefitType.gift,
          active: true,
        },
      }),
    );
  });

  it('the created bridge is immediately findable by Retention V2 and Reward Goals', async () => {
    // Both `RetentionIncentivesService.list()` and the Reward Goal engine's
    // `findEligibleIncentiveIds` query `retentionIncentiveDefinition` scoped
    // only by `businessId` (+ `active`/`rewardGoalEligible` for the latter) —
    // neither filters on `benefitId`, so a bridge-created row needs no
    // special-casing on their side. This asserts the row this repository
    // creates already satisfies both: scoped to the right business, active.
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
    });
    tx.retentionIncentiveDefinition.findUnique.mockResolvedValue(null);
    tx.retentionIncentiveDefinition.create.mockResolvedValue({
      id: 'def-1',
      automationEligible: false,
      rewardGoalEligible: false,
    });
    const repo = new BenefitsRepository(prisma as never);

    await repo.setRetentionBridge('biz-1', 'b1', { rewardGoalEligible: true });

    const created = (
      tx.retentionIncentiveDefinition.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(created.businessId).toBe('biz-1');
    expect(created.active).toBe(true);
  });

  it('never duplicates: reuses the existing definition found by benefitId', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
    });
    tx.retentionIncentiveDefinition.findUnique.mockResolvedValue({
      id: 'def-1',
      automationEligible: false,
      rewardGoalEligible: false,
    });
    const repo = new BenefitsRepository(prisma as never);

    await repo.setRetentionBridge('biz-1', 'b1', { rewardGoalEligible: true });

    expect(tx.retentionIncentiveDefinition.create).not.toHaveBeenCalled();
    expect(tx.retentionIncentiveDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'def-1' },
        data: { rewardGoalEligible: true },
      }),
    );
  });

  it('does not create a bridge just to turn everything off (no-op when none exists)', async () => {
    const { prisma, tx } = makePrisma();
    tx.benefit.findFirst.mockResolvedValue({
      id: 'b1',
      type: BenefitType.gift,
      title: 'Capuccino gratis',
    });
    tx.retentionIncentiveDefinition.findUnique.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.setRetentionBridge('biz-1', 'b1', {
      automationEligible: false,
    });

    expect(result).toBeNull();
    expect(tx.retentionIncentiveDefinition.create).not.toHaveBeenCalled();
  });
});

// Modelo de emisiones múltiples (pedido explícito): un cliente puede
// recibir el MISMO Benefit muchas veces — cada entrega es su propia fila,
// auditable para siempre, con su propio código. `@@unique([benefitId,
// customerId])` ya no existe. `registerParticipation` queda acotado a
// sorteos (única fuente donde "una fila por ciclo abierto" es correcto);
// todo lo demás usa `issueBenefit` (siempre nuevo) o `ensureRedemptionCode`
// (reusa mientras esté abierto, escopeado por `source`).
describe('BenefitsRepository.registerParticipation — sorteos (RAFFLE), única fuente que reabre fila', () => {
  function makeParticipationPrisma() {
    const benefitParticipation = {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'p1' }),
    };
    const benefit = {
      findUnique: jest.fn().mockResolvedValue({ title: 'Sorteo mensual' }),
    };
    const prisma = { benefitParticipation, benefit };
    return { prisma, benefitParticipation, benefit };
  }

  it('primera vez (sin fila previa): crea la participación con source RAFFLE', async () => {
    const { prisma, benefitParticipation } = makeParticipationPrisma();
    benefitParticipation.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    await repo.registerParticipation('biz-1', 'ben-1', 'cus-1');

    expect(benefitParticipation.create).toHaveBeenCalledWith({
      data: {
        businessId: 'biz-1',
        benefitId: 'ben-1',
        customerId: 'cus-1',
        source: BenefitIssuanceSource.RAFFLE,
        benefitTitleSnapshot: 'Sorteo mensual',
      },
    });
    expect(benefitParticipation.update).not.toHaveBeenCalled();
  });

  it('ciclo actual ya abierto: no toca nada', async () => {
    const { prisma, benefitParticipation } = makeParticipationPrisma();
    const existing = { id: 'p1', raffleDrawId: null };
    benefitParticipation.findFirst.mockResolvedValue(existing);
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.registerParticipation('biz-1', 'ben-1', 'cus-1');

    expect(result).toBe(existing);
    expect(benefitParticipation.update).not.toHaveBeenCalled();
    expect(benefitParticipation.create).not.toHaveBeenCalled();
  });

  it('ciclo anterior ya cerrado por un sorteo (raffleDrawId != null): reabre la misma fila', async () => {
    const { prisma, benefitParticipation } = makeParticipationPrisma();
    const existing = { id: 'p1', raffleDrawId: 'draw-1' };
    benefitParticipation.findFirst.mockResolvedValue(existing);
    const repo = new BenefitsRepository(prisma as never);

    await repo.registerParticipation('biz-1', 'ben-1', 'cus-1');

    expect(benefitParticipation.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ raffleDrawId: null }),
    });
  });

  it('busca la última participación RAFFLE de este par, no de cualquier source', async () => {
    const { prisma, benefitParticipation } = makeParticipationPrisma();
    benefitParticipation.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    await repo.registerParticipation('biz-1', 'ben-1', 'cus-1');

    expect(benefitParticipation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          benefitId: 'ben-1',
          customerId: 'cus-1',
          source: BenefitIssuanceSource.RAFFLE,
        },
      }),
    );
  });
});

// Pedido explícito: Juan recibe un 2x1 por promoción, lo canjea (emisión
// #1, REDIMIDA para siempre), y tres meses después recibe el MISMO 2x1 de
// nuevo (emisión #2, código nuevo) — ambas quedan auditables
// independientemente. `issueBenefit` es lo que hace esto posible: nunca
// mira si ya existe una fila, siempre crea una nueva.
describe('BenefitsRepository.issueBenefit — siempre una emisión nueva', () => {
  function makePrisma() {
    const benefitParticipation = {
      create: jest.fn().mockResolvedValue({ id: 'p-new' }),
    };
    const benefit = {
      findUnique: jest.fn().mockResolvedValue({ title: '2x1' }),
    };
    return { prisma: { benefitParticipation, benefit }, benefitParticipation };
  }

  it('crea una fila nueva con su propio código, sin mirar si ya existe una', async () => {
    const { prisma, benefitParticipation } = makePrisma();
    const repo = new BenefitsRepository(prisma as never);

    await repo.issueBenefit({
      businessId: 'biz-1',
      benefitId: 'ben-1',
      customerId: 'cus-1',
      source: BenefitIssuanceSource.PROMOTION,
    });

    expect(benefitParticipation.create).toHaveBeenCalledTimes(1);
    const data = (
      benefitParticipation.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data).toMatchObject({
      businessId: 'biz-1',
      benefitId: 'ben-1',
      customerId: 'cus-1',
      source: BenefitIssuanceSource.PROMOTION,
      benefitTitleSnapshot: '2x1',
    });
    expect(typeof data.redemptionCode).toBe('string');
  });

  it('tres emisiones seguidas del mismo Benefit al mismo cliente son tres `create` distintos', async () => {
    const { prisma, benefitParticipation } = makePrisma();
    const repo = new BenefitsRepository(prisma as never);

    for (let i = 0; i < 3; i++) {
      await repo.issueBenefit({
        businessId: 'biz-1',
        benefitId: 'ben-1',
        customerId: 'cus-1',
        source: BenefitIssuanceSource.PROMOTION,
      });
    }

    expect(benefitParticipation.create).toHaveBeenCalledTimes(3);
  });

  it('reintenta ante una colisión de código (P2002) en vez de fallar', async () => {
    const { prisma, benefitParticipation } = makePrisma();
    benefitParticipation.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      )
      .mockResolvedValueOnce({ id: 'p-new' });
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.issueBenefit({
      businessId: 'biz-1',
      benefitId: 'ben-1',
      customerId: 'cus-1',
      source: BenefitIssuanceSource.PROMOTION,
    });

    expect(result).toEqual({ id: 'p-new' });
    expect(benefitParticipation.create).toHaveBeenCalledTimes(2);
  });

  it('completa campaignId cuando se pasa', async () => {
    const { prisma, benefitParticipation } = makePrisma();
    const repo = new BenefitsRepository(prisma as never);

    await repo.issueBenefit({
      businessId: 'biz-1',
      benefitId: 'ben-1',
      customerId: 'cus-1',
      source: BenefitIssuanceSource.PROMOTION,
      campaignId: 'camp-1',
    });

    expect(benefitParticipation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ campaignId: 'camp-1' }),
      }),
    );
  });

  /**
   * Auditoría (pedido explícito): Promociones emite el lote entero dentro
   * de una `$transaction` — esto solo funciona si `issueBenefit` usa el
   * `tx` que le pasan en vez de `this.prisma` directo.
   */
  it('usa el cliente de transacción pasado como segundo argumento, no this.prisma directo', async () => {
    const { prisma, benefitParticipation } = makePrisma();
    const repo = new BenefitsRepository(prisma as never);
    const txBenefitParticipation = {
      create: jest.fn().mockResolvedValue({ id: 'p-in-tx' }),
    };
    const tx = {
      benefitParticipation: txBenefitParticipation,
      benefit: { findUnique: jest.fn().mockResolvedValue({ title: '2x1' }) },
    };

    const result = await repo.issueBenefit(
      {
        businessId: 'biz-1',
        benefitId: 'ben-1',
        customerId: 'cus-1',
        source: BenefitIssuanceSource.PROMOTION,
      },
      tx as never,
    );

    expect(result).toEqual({ id: 'p-in-tx' });
    expect(txBenefitParticipation.create).toHaveBeenCalledTimes(1);
    expect(benefitParticipation.create).not.toHaveBeenCalled();
  });
});

describe('BenefitsRepository.ensureRedemptionCode — reusa mientras esté abierto, escopeado por source', () => {
  function makePrisma() {
    const benefitParticipation = {
      findFirst: jest.fn(),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'p-new', redemptionCode: 'NEWCODE1' }),
      update: jest
        .fn()
        .mockResolvedValue({ id: 'p1', redemptionCode: 'NEWCODE1' }),
    };
    const benefit = {
      findUnique: jest.fn().mockResolvedValue({ title: 'Café gratis' }),
    };
    return { prisma: { benefitParticipation, benefit }, benefitParticipation };
  }

  it('sin ninguna emisión abierta de este source: crea una nueva', async () => {
    const { prisma, benefitParticipation } = makePrisma();
    benefitParticipation.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    await repo.ensureRedemptionCode(
      'biz-1',
      'ben-1',
      'cus-1',
      BenefitIssuanceSource.WELCOME,
    );

    expect(benefitParticipation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: BenefitIssuanceSource.WELCOME,
        }),
      }),
    );
  });

  it('ya hay una abierta con código: la devuelve sin tocar nada', async () => {
    const { prisma, benefitParticipation } = makePrisma();
    const existing = { id: 'p1', redemptionCode: 'CODE-1', redeemedAt: null };
    benefitParticipation.findFirst.mockResolvedValue(existing);
    const repo = new BenefitsRepository(prisma as never);

    const result = await repo.ensureRedemptionCode(
      'biz-1',
      'ben-1',
      'cus-1',
      BenefitIssuanceSource.CHECKIN_ACTIVE,
    );

    expect(result).toBe(existing);
    expect(benefitParticipation.create).not.toHaveBeenCalled();
    expect(benefitParticipation.update).not.toHaveBeenCalled();
  });

  it('busca solo entre filas SIN canjear (redeemedAt: null) de ese source', async () => {
    const { prisma, benefitParticipation } = makePrisma();
    benefitParticipation.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    await repo.ensureRedemptionCode(
      'biz-1',
      'ben-1',
      'cus-1',
      BenefitIssuanceSource.WELCOME,
    );

    expect(benefitParticipation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          benefitId: 'ben-1',
          customerId: 'cus-1',
          source: BenefitIssuanceSource.WELCOME,
          redeemedAt: null,
        },
      }),
    );
  });

  it('la última de este source ya se canjeó (no queda ninguna abierta): emite una nueva, no la reabre', async () => {
    // `findFirst` ya filtra `redeemedAt: null` — una vez canjeada, deja de
    // aparecer como "existing", así que el método cae directo a crear una
    // fila nueva. Este test confirma que NO llama a `update` sobre la vieja.
    const { prisma, benefitParticipation } = makePrisma();
    benefitParticipation.findFirst.mockResolvedValue(null);
    const repo = new BenefitsRepository(prisma as never);

    await repo.ensureRedemptionCode(
      'biz-1',
      'ben-1',
      'cus-1',
      BenefitIssuanceSource.WELCOME,
    );

    expect(benefitParticipation.update).not.toHaveBeenCalled();
    expect(benefitParticipation.create).toHaveBeenCalled();
  });
});

describe('BenefitsRepository.findRedemption — la más reciente de este source', () => {
  it('escopea por businessId, benefitId, customerId y source, ordenando por createdAt desc', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { benefitParticipation: { findFirst } };
    const repo = new BenefitsRepository(prisma as never);

    await repo.findRedemption(
      'biz-1',
      'ben-1',
      'cus-1',
      BenefitIssuanceSource.WELCOME,
    );

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: 'biz-1',
          benefitId: 'ben-1',
          customerId: 'cus-1',
          source: BenefitIssuanceSource.WELCOME,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});

describe('BenefitsRepository.findAvailableParticipations — vencimiento', () => {
  it('excluye participaciones vencidas e incluye las sin expiresAt o aún vigentes', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { benefitParticipation: { findMany } };
    const repo = new BenefitsRepository(prisma as never);
    const now = new Date('2026-08-19T00:00:00.000Z');

    await repo.findAvailableParticipations('biz-1', 'cus-1', [], now);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        }),
      }),
    );
  });
});
