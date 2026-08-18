import { LoyaltyProgramService } from './loyalty-program.service';

function makeDeps(
  options: {
    settings?: Record<string, unknown>;
    reward?: unknown;
    welcome?: unknown;
  } = {},
) {
  const prisma = {
    customerRewardGoal: {
      groupBy: jest.fn().mockResolvedValue([{ customerId: 'c-1' }]),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    retentionIncentiveDefinition: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.reward === undefined
            ? { id: 'inc-1', name: '3 medialunas', benefitId: 'ben-1' }
            : options.reward,
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    business: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ welcomeBenefit: options.welcome ?? null }),
    },
    rewardGoalBonusStamp: { findMany: jest.fn().mockResolvedValue([]) },
    checkinFeedback: { findMany: jest.fn().mockResolvedValue([]) },
    benefit: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({ title: 'Café gratis' }),
      create: jest.fn().mockResolvedValue({ id: 'ben-new' }),
    },
    benefitParticipation: { findMany: jest.fn().mockResolvedValue([]) },
    retentionSettings: { update: jest.fn().mockResolvedValue({}) },
  };
  const settings = {
    getOrCreate: jest.fn().mockResolvedValue({
      rewardGoalsEnabled: true,
      benefitsEnabled: true,
      rewardGoalFeedbackBonusEnabled: false,
      rewardGoalMinVisits: 5,
      rewardGoalMaxVisits: 5,
      ...options.settings,
    }),
  };
  const benefits = { setRetentionBridge: jest.fn().mockResolvedValue({}) };
  const programAudit = {
    record: jest.fn().mockResolvedValue({}),
    list: jest.fn().mockResolvedValue([]),
  };
  const retentionBootstrap = {
    ensureDefaultRetentionSetup: jest.fn().mockResolvedValue([]),
  };
  // Default "sin Subscription" (LEGACY/Platform Admin/negocio anterior a
  // self-service) — sin tope, sin trial. El tope/trial reales tienen su
  // propio describe block en `plans.service.spec.ts`.
  const plans = {
    getSelfServiceStatus: jest.fn().mockResolvedValue({
      maxCustomers: null,
      benefitsTrialExpired: false,
      trialEndsAt: null,
      isPro: false,
      planName: null,
    }),
    ensureFreeSubscriptionIfMissing: jest.fn().mockResolvedValue({}),
    startBenefitsTrialIfNeeded: jest.fn().mockResolvedValue(undefined),
  };
  return {
    prisma,
    settings,
    benefits,
    programAudit,
    retentionBootstrap,
    plans,
  };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new LoyaltyProgramService(
    deps.prisma as never,
    deps.settings as never,
    deps.benefits as never,
    deps.programAudit as never,
    deps.retentionBootstrap as never,
    deps.plans as never,
  );
}

describe('LoyaltyProgramService — traduce el estado interno a lenguaje de negocio', () => {
  it('expone sellos necesarios, recompensa y estado, sin nombres internos', async () => {
    const service = makeService(makeDeps());

    const result = await service.getOverview('biz-1');

    expect(result.enabled).toBe(true);
    expect(result.stampsRequired).toBe(5);
    expect(result.reward).toEqual({ name: '3 medialunas', benefitId: 'ben-1' });
    // Nada de "rewardGoal", "incentiveDefinition" ni "retention" en la salida.
    expect(Object.keys(result)).toEqual([
      'enabled',
      'benefitsEnabled',
      'feedbackBonusEnabled',
      'stampsRequired',
      'reward',
      'welcomeGift',
      'stats',
      'recentActivity',
      'benefitsCount',
      'plan',
    ]);
    // Sellos y Beneficios son capacidades independientes — ambas visibles.
    expect(result.benefitsEnabled).toBe(true);
    // Self-service: sin Subscription (el mock default) no hay tope ni trial.
    expect(result.plan).toEqual({
      maxCustomers: null,
      benefitsTrialExpired: false,
      trialEndsAt: null,
      isPro: false,
      planName: null,
    });
  });

  it('refleja el tope/trial self-service tal cual los devuelve PlansService', async () => {
    const deps = makeDeps();
    deps.plans.getSelfServiceStatus.mockResolvedValue({
      maxCustomers: 50,
      benefitsTrialExpired: true,
      trialEndsAt: new Date('2026-01-01T00:00:00.000Z'),
      isPro: false,
      planName: 'Free — sellos y beneficios',
    });
    const service = makeService(deps);

    const result = await service.getOverview('biz-1');

    expect(result.plan).toEqual({
      maxCustomers: 50,
      benefitsTrialExpired: true,
      trialEndsAt: '2026-01-01T00:00:00.000Z',
      isPro: false,
      planName: 'Free — sellos y beneficios',
    });
  });

  it('sin recompensa autorizada devuelve null en vez de inventar una', async () => {
    const service = makeService(makeDeps({ reward: null }));

    const result = await service.getOverview('biz-1');

    expect(result.reward).toBeNull();
  });

  it('sin sellos configurados devuelve null — nunca un default silencioso', async () => {
    const service = makeService(
      makeDeps({
        settings: { rewardGoalMinVisits: null, rewardGoalMaxVisits: null },
      }),
    );

    const result = await service.getOverview('biz-1');

    expect(result.stampsRequired).toBeNull();
  });

  it('el regalo de bienvenida sale del beneficio activo, independiente de la recompensa', async () => {
    const service = makeService(
      makeDeps({
        welcome: { id: 'ben-2', title: 'Café gratis', type: 'gift' },
      }),
    );

    const result = await service.getOverview('biz-1');

    expect(result.welcomeGift).toEqual({
      name: 'Café gratis',
      benefitId: 'ben-2',
    });
    // Y no es el mismo beneficio que la recompensa: son usos independientes.
    expect(result.reward?.benefitId).toBe('ben-1');
  });

  it('cuenta clientes participando por cliente distinto, no por tarjeta', async () => {
    const deps = makeDeps();
    deps.prisma.customerRewardGoal.groupBy.mockResolvedValue([
      { customerId: 'c-1' },
      { customerId: 'c-2' },
    ]);
    const service = makeService(deps);

    const result = await service.getOverview('biz-1');

    expect(result.stats.customersParticipating).toBe(2);
    expect(deps.prisma.customerRewardGoal.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['customerId'] }),
    );
  });
});

describe('LoyaltyProgramService — actividad reciente', () => {
  it('mezcla las cuatro fuentes y ordena por fecha real, más nueva primero', async () => {
    const deps = makeDeps();
    deps.prisma.customerRewardGoal.findMany
      .mockResolvedValueOnce([
        {
          id: 'g-1',
          unlockedAt: new Date('2026-09-03T10:00:00.000Z'),
          customer: { name: 'Ana' },
          incentiveDefinition: { name: '3 medialunas' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'g-2',
          redeemedAt: new Date('2026-09-05T10:00:00.000Z'),
          customer: { name: 'Beto' },
          incentiveDefinition: { name: '3 medialunas' },
        },
      ]);
    deps.prisma.rewardGoalBonusStamp.findMany.mockResolvedValue([
      {
        id: 's-1',
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
        customer: { name: 'Caro' },
      },
    ]);
    const service = makeService(deps);

    const result = await service.getOverview('biz-1');

    expect(result.recentActivity.map((a) => a.type)).toEqual([
      'redeemed',
      'unlocked',
      'stamp',
    ]);
    expect(result.recentActivity[0].customerName).toBe('Beto');
  });
});

describe('LoyaltyProgramService — Sellos: toggle ON/OFF', () => {
  it('activar sin sellos/recompensa configurados falla con un mensaje claro', async () => {
    const deps = makeDeps({
      settings: { rewardGoalsEnabled: false },
      reward: null,
    });
    const service = makeService(deps);

    await expect(
      service.setStampsCardEnabled('biz-1', { enabled: true }),
    ).rejects.toThrow(/Configurá los sellos/);
    expect(deps.prisma.retentionSettings.update).not.toHaveBeenCalled();
  });

  it('activar con sellos/recompensa ya configurados prende el flag y audita', async () => {
    const deps = makeDeps({ settings: { rewardGoalsEnabled: false } });
    const service = makeService(deps);

    await service.setStampsCardEnabled('biz-1', { enabled: true }, 'user-1');

    expect(deps.prisma.retentionSettings.update).toHaveBeenCalledWith({
      where: { businessId: 'biz-1' },
      data: { rewardGoalsEnabled: true },
    });
    expect(deps.programAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'card_activated',
        actorUserId: 'user-1',
      }),
    );
    // Cambio de modalidad reversible: activar sellos asegura el plan Free
    // (tope de 50) igual que si se hubiera elegido en el onboarding.
    expect(deps.plans.ensureFreeSubscriptionIfMissing).toHaveBeenCalledWith(
      'biz-1',
    );
    // Gap cerrado: Beneficios ya está prendido (default `true`) en este
    // momento, así que activar sellos es la primera vez que el negocio
    // tiene un plan self-service real — el trial de 30 días arranca acá,
    // para que "Beneficios + sellos" nunca deje Beneficios Pro gratis para
    // siempre.
    expect(deps.plans.startBenefitsTrialIfNeeded).toHaveBeenCalledWith('biz-1');
  });

  it('activar sellos con Beneficios ya apagado NO arranca el trial (nada que "usar" todavía)', async () => {
    const deps = makeDeps({
      settings: { rewardGoalsEnabled: false, benefitsEnabled: false },
    });
    const service = makeService(deps);

    await service.setStampsCardEnabled('biz-1', { enabled: true });

    expect(deps.plans.ensureFreeSubscriptionIfMissing).toHaveBeenCalledWith(
      'biz-1',
    );
    expect(deps.plans.startBenefitsTrialIfNeeded).not.toHaveBeenCalled();
  });

  it('desactivar apaga la tarjeta Y el recordatorio de progreso, sin tocar la recompensa', async () => {
    const deps = makeDeps({ settings: { rewardGoalsEnabled: true } });
    const service = makeService(deps);

    await service.setStampsCardEnabled('biz-1', { enabled: false });

    expect(deps.prisma.retentionSettings.update).toHaveBeenCalledWith({
      where: { businessId: 'biz-1' },
      data: { rewardGoalsEnabled: false, progressReminderEnabled: false },
    });
    expect(deps.benefits.setRetentionBridge).not.toHaveBeenCalled();
    // Apagar nunca provisiona ni toca el plan — solo prender lo hace.
    expect(deps.plans.ensureFreeSubscriptionIfMissing).not.toHaveBeenCalled();
    expect(deps.plans.startBenefitsTrialIfNeeded).not.toHaveBeenCalled();
  });

  it('reafirmar el mismo estado es un no-op silencioso', async () => {
    const deps = makeDeps({ settings: { rewardGoalsEnabled: true } });
    const service = makeService(deps);

    await service.setStampsCardEnabled('biz-1', { enabled: true });

    expect(deps.prisma.retentionSettings.update).not.toHaveBeenCalled();
    expect(deps.programAudit.record).not.toHaveBeenCalled();
  });
});

describe('LoyaltyProgramService — Beneficios: toggle ON/OFF (capacidad independiente de sellos)', () => {
  it('activar prende el flag, asegura el plan Free y arranca el trial si nunca corrió', async () => {
    const deps = makeDeps({ settings: { benefitsEnabled: false } });
    const service = makeService(deps);

    await service.setBenefitsEnabled('biz-1', { enabled: true }, 'user-1');

    expect(deps.prisma.retentionSettings.update).toHaveBeenCalledWith({
      where: { businessId: 'biz-1' },
      data: { benefitsEnabled: true },
    });
    expect(deps.plans.ensureFreeSubscriptionIfMissing).toHaveBeenCalledWith(
      'biz-1',
    );
    expect(deps.plans.startBenefitsTrialIfNeeded).toHaveBeenCalledWith('biz-1');
    expect(deps.programAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'benefits_catalog_activated',
        actorUserId: 'user-1',
      }),
    );
  });

  it('desactivar apaga el flag sin tocar el plan ni el trial — el catálogo sigue intacto', async () => {
    const deps = makeDeps({ settings: { benefitsEnabled: true } });
    const service = makeService(deps);

    await service.setBenefitsEnabled('biz-1', { enabled: false });

    expect(deps.prisma.retentionSettings.update).toHaveBeenCalledWith({
      where: { businessId: 'biz-1' },
      data: { benefitsEnabled: false },
    });
    expect(deps.plans.ensureFreeSubscriptionIfMissing).not.toHaveBeenCalled();
    expect(deps.plans.startBenefitsTrialIfNeeded).not.toHaveBeenCalled();
    expect(deps.programAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'benefits_catalog_deactivated' }),
    );
  });

  it('reafirmar el mismo estado es un no-op silencioso', async () => {
    const deps = makeDeps({ settings: { benefitsEnabled: true } });
    const service = makeService(deps);

    await service.setBenefitsEnabled('biz-1', { enabled: true });

    expect(deps.prisma.retentionSettings.update).not.toHaveBeenCalled();
    expect(deps.programAudit.record).not.toHaveBeenCalled();
    expect(deps.plans.ensureFreeSubscriptionIfMissing).not.toHaveBeenCalled();
  });
});

describe('LoyaltyProgramService — Sellos: configurar sellos + recompensa', () => {
  it('crea/autoriza la recompensa, guarda sellos y prende el recordatorio de progreso', async () => {
    const deps = makeDeps({ settings: { rewardGoalsEnabled: false } });
    const service = makeService(deps);

    await service.updateStampsCardConfig(
      'biz-1',
      { rewardTitle: 'Café gratis', stampsRequired: 7 },
      'user-1',
    );

    expect(
      deps.prisma.retentionIncentiveDefinition.updateMany,
    ).toHaveBeenCalledWith({
      where: { businessId: 'biz-1', rewardGoalEligible: true },
      data: { rewardGoalEligible: false },
    });
    expect(deps.benefits.setRetentionBridge).toHaveBeenCalledWith(
      'biz-1',
      'ben-new',
      { rewardGoalEligible: true },
    );
    expect(deps.prisma.retentionSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rewardGoalsEnabled: true,
          rewardGoalMinVisits: 7,
          rewardGoalMaxVisits: 7,
          progressReminderEnabled: true,
        }),
      }),
    );
  });

  it('sin recompensa elegida ni creada, falla en vez de dejar la tarjeta a medias', async () => {
    const service = makeService(makeDeps());

    await expect(
      service.updateStampsCardConfig('biz-1', { stampsRequired: 5 }),
    ).rejects.toThrow();
  });

  it('IDEMPOTENTE: reenviar el mismo título reusa el beneficio, no lo duplica', async () => {
    const deps = makeDeps();
    deps.prisma.benefit.findFirst.mockResolvedValue({ id: 'ben-existente' });
    const service = makeService(deps);

    await service.updateStampsCardConfig('biz-1', {
      rewardTitle: 'Café gratis',
      stampsRequired: 5,
    });

    expect(deps.prisma.benefit.create).not.toHaveBeenCalled();
    expect(deps.benefits.setRetentionBridge).toHaveBeenCalledWith(
      'biz-1',
      'ben-existente',
      { rewardGoalEligible: true },
    );
  });

  it('cambiar la config de una tarjeta YA activa audita "cambiaste", no "activaste"', async () => {
    const deps = makeDeps({ settings: { rewardGoalsEnabled: true } });
    const service = makeService(deps);

    await service.updateStampsCardConfig('biz-1', {
      rewardTitle: '2x1',
      stampsRequired: 7,
    });

    expect(deps.programAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'card_config_changed' }),
    );
  });

  /**
   * El punto central del pedido: cambiar sellos/recompensa NUNCA edita en el
   * lugar el `RetentionIncentiveDefinition` ya autorizado — crea uno nuevo y
   * desautoriza el anterior, así que un `CustomerRewardGoal` activo (que
   * apunta por FK al viejo) nunca ve cambiar su objetivo.
   */
  it('nunca actualiza en el lugar la recompensa vieja: solo crea+desautoriza', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.updateStampsCardConfig('biz-1', {
      rewardTitle: 'Nueva recompensa',
      stampsRequired: 5,
    });

    expect(deps.prisma.benefit.create).toHaveBeenCalled();
    // Nunca se llama a un update sobre el beneficio existente.
    expect(deps.prisma.benefit).not.toHaveProperty('update');
  });
});

describe('LoyaltyProgramService — Historial', () => {
  it('mezcla eventos auditados con eventos reconstruidos, ordenados por fecha', async () => {
    const deps = makeDeps();
    deps.programAudit.list.mockResolvedValue([
      {
        id: 'a-1',
        message: 'Activaste la tarjeta de sellos',
        createdAt: new Date('2026-09-04T10:00:00.000Z'),
      },
    ]);
    deps.prisma.benefitParticipation.findMany
      .mockResolvedValueOnce([
        {
          id: 'p-1',
          createdAt: new Date('2026-09-05T10:00:00.000Z'),
          customer: { name: 'Ana' },
          benefit: { title: '10% off' },
        },
      ])
      .mockResolvedValueOnce([]);
    const service = makeService(deps);

    const result = await service.getHistory('biz-1');

    expect(result[0].message).toContain('10% off');
    expect(result[1].message).toBe('Activaste la tarjeta de sellos');
  });
});
