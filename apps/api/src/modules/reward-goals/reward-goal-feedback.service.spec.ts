import { Prisma } from '@prisma/client';
import { RewardGoalFeedbackService } from './reward-goal-feedback.service';

const NOW = new Date('2026-09-05T12:00:00.000Z');

function makeDeps(
  options: {
    existingFeedback?: { score: number } | null;
    activeGoal?: { id: string } | null;
    unlockResult?: unknown;
    currentView?: unknown;
    bonusCreateError?: { code: string } | null;
    /** Owner toggle (§3 follow-up) — defaults to true, same as the schema default. */
    bonusEnabled?: boolean;
    /** null simulates "no RetentionSettings row yet" — should still default to enabled. */
    settingsRow?: { rewardGoalFeedbackBonusEnabled: boolean } | null;
  } = {},
) {
  const prisma = {
    checkinFeedback: {
      findUnique: jest.fn().mockResolvedValue(options.existingFeedback ?? null),
      create: jest.fn().mockResolvedValue({ id: 'feedback-1' }),
    },
    customerRewardGoal: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.activeGoal === undefined
            ? { id: 'goal-1' }
            : options.activeGoal,
        ),
    },
    retentionSettings: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.settingsRow !== undefined
            ? options.settingsRow
            : { rewardGoalFeedbackBonusEnabled: options.bonusEnabled ?? true },
        ),
    },
    rewardGoalBonusStamp: {
      create: jest.fn().mockImplementation(() => {
        if (options.bonusCreateError) {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('unique violation', {
              code: options.bonusCreateError.code,
              clientVersion: 'test',
            }),
          );
        }
        return Promise.resolve({ id: 'stamp-1' });
      }),
    },
    visit: {
      create: jest.fn(),
    },
  };
  const unlock = {
    evaluateUnlock: jest.fn().mockResolvedValue(
      options.unlockResult ?? {
        status: 'in_progress',
        goalId: 'goal-1',
        progressVisits: 1,
        visitProgress: 0,
        bonusStamps: 1,
        targetAdditionalVisits: 2,
        incentiveName: 'Capuccino gratis',
      },
    ),
  };
  const orchestrator = {
    currentView: jest.fn().mockResolvedValue(
      options.currentView ?? {
        goal: null,
        unlockedNow: false,
        benefit: null,
      },
    ),
  };
  return { prisma, unlock, orchestrator };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RewardGoalFeedbackService(
    deps.prisma as never,
    deps.unlock as never,
    deps.orchestrator as never,
  );
}

describe('RewardGoalFeedbackService — visita real (+1) sigue siendo el baseline', () => {
  it('nunca toca Visit ni la cuenta de progreso real — solo agrega un stamp aparte', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.submit('biz-1', 'cust-1', 'visit-1', 5, undefined, NOW);

    expect(deps.prisma.visit.create).not.toHaveBeenCalled();
  });
});

describe('RewardGoalFeedbackService — feedback completado otorga el bonus (§9)', () => {
  it.each([1, 2, 3, 4, 5])(
    'otorga exactamente 1 sello, sin importar el puntaje (%i)',
    async (score) => {
      const deps = makeDeps();
      const service = makeService(deps);

      const result = await service.submit(
        'biz-1',
        'cust-1',
        'visit-1',
        score,
        undefined,
        NOW,
      );

      expect(deps.prisma.rewardGoalBonusStamp.create).toHaveBeenCalledWith({
        data: {
          businessId: 'biz-1',
          customerId: 'cust-1',
          rewardGoalId: 'goal-1',
          feedbackId: 'feedback-1',
        },
      });
      expect(result.bonusGranted).toBe(true);
    },
  );

  it('el bonus se otorga igual con un puntaje bajo', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const low = await service.submit(
      'biz-1',
      'cust-1',
      'visit-1',
      2,
      'no me gustó',
      NOW,
    );
    expect(low.bonusGranted).toBe(true);
  });

  /**
   * La oferta de Google dejó de depender del puntaje. Filtrar por
   * `score >= 4` era elegir a quién se le permite opinar en público, y
   * convertía la reseña en premio por estar contento. Ahora la invitación es
   * la misma para todos y decide el cliente.
   */
  it.each([1, 2, 3, 4, 5])(
    'con puntaje %i se ofrece Google exactamente igual',
    async (score) => {
      const deps = makeDeps();
      const service = makeService(deps);

      const result = await service.submit(
        'biz-1',
        'cust-1',
        'visit-1',
        score,
        undefined,
        NOW,
      );

      expect(result.offerGoogle).toBe(true);
    },
  );

  it('el sello extra es por el FEEDBACK, no por abrir Google', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.submit(
      'biz-1',
      'cust-1',
      'visit-1',
      4,
      undefined,
      NOW,
    );

    // No existe ningún método para "confirmar que abrió Google" — el bonus
    // ya quedó otorgado arriba, antes de que este resultado siquiera exista.
    expect(result.bonusGranted).toBe(true);
  });
});

describe('RewardGoalFeedbackService — sin meta activa', () => {
  it('guarda el feedback pero no otorga ningún bonus si no hay una meta ACTIVE', async () => {
    const deps = makeDeps({ activeGoal: null });
    const service = makeService(deps);

    const result = await service.submit(
      'biz-1',
      'cust-1',
      'visit-1',
      5,
      undefined,
      NOW,
    );

    expect(deps.prisma.rewardGoalBonusStamp.create).not.toHaveBeenCalled();
    expect(deps.unlock.evaluateUnlock).not.toHaveBeenCalled();
    expect(result.bonusGranted).toBe(false);
    expect(result.rewardGoal).toEqual({
      goal: null,
      unlockedNow: false,
      benefit: null,
    });
  });
});

describe('RewardGoalFeedbackService — toggle del sello bonus (§3 follow-up)', () => {
  it('bonus OFF: guarda el feedback pero NO otorga sello ni cambia el progreso', async () => {
    const deps = makeDeps({
      bonusEnabled: false,
      unlockResult: {
        status: 'in_progress',
        goalId: 'goal-1',
        progressVisits: 1, // sin cambios respecto de antes de este feedback
        visitProgress: 1,
        bonusStamps: 0,
        targetAdditionalVisits: 2,
        incentiveName: 'Capuccino gratis',
      },
    });
    const service = makeService(deps);

    const result = await service.submit(
      'biz-1',
      'cust-1',
      'visit-1',
      5,
      undefined,
      NOW,
    );

    expect(deps.prisma.checkinFeedback.create).toHaveBeenCalledTimes(1); // el feedback SÍ se guarda
    expect(deps.prisma.rewardGoalBonusStamp.create).not.toHaveBeenCalled();
    expect(result.bonusGranted).toBe(false);
    expect(result.rewardGoal.goal).toMatchObject({
      progressVisits: 1,
      bonusStamps: 0,
    });
  });

  it('sin fila de RetentionSettings (negocio que nunca abrió esta pantalla): bonus OFF por default, opt-in', async () => {
    const deps = makeDeps({ settingsRow: null }); // negocio sin settings creado todavía
    const service = makeService(deps);

    const result = await service.submit(
      'biz-1',
      'cust-1',
      'visit-1',
      5,
      undefined,
      NOW,
    );

    expect(deps.prisma.rewardGoalBonusStamp.create).not.toHaveBeenCalled();
    expect(result.bonusGranted).toBe(false);
  });

  it('checkbox ON explícito: otorga exactamente 1 sello', async () => {
    const deps = makeDeps({ bonusEnabled: true });
    const service = makeService(deps);

    const result = await service.submit(
      'biz-1',
      'cust-1',
      'visit-1',
      5,
      undefined,
      NOW,
    );

    expect(deps.prisma.rewardGoalBonusStamp.create).toHaveBeenCalledTimes(1);
    expect(result.bonusGranted).toBe(true);
  });

  it('checkbox OFF explícito: nunca otorga ningún sello', async () => {
    const deps = makeDeps({ bonusEnabled: false });
    const service = makeService(deps);

    const result = await service.submit(
      'biz-1',
      'cust-1',
      'visit-1',
      5,
      undefined,
      NOW,
    );

    expect(deps.prisma.rewardGoalBonusStamp.create).not.toHaveBeenCalled();
    expect(result.bonusGranted).toBe(false);
  });
});

describe('RewardGoalFeedbackService — idempotencia (repetir/reabrir no duplica)', () => {
  it('una segunda vez para la misma visita no otorga un segundo bonus', async () => {
    const deps = makeDeps({ existingFeedback: { score: 5 } });
    const service = makeService(deps);

    const result = await service.submit(
      'biz-1',
      'cust-1',
      'visit-1',
      3, // el puntaje de este segundo intento es irrelevante — se ignora
      undefined,
      NOW,
    );

    expect(deps.prisma.checkinFeedback.create).not.toHaveBeenCalled();
    expect(deps.prisma.rewardGoalBonusStamp.create).not.toHaveBeenCalled();
    expect(result.alreadySubmitted).toBe(true);
    expect(result.bonusGranted).toBe(false);
    // El offerGoogle de la respuesta repetida usa el puntaje YA guardado,
    // no el del segundo intento.
    expect(result.offerGoogle).toBe(true);
  });

  it('una carrera concurrente sobre el mismo feedback nunca otorga dos bonus (constraint P2002)', async () => {
    const deps = makeDeps({ bonusCreateError: { code: 'P2002' } });
    const service = makeService(deps);

    const result = await service.submit(
      'biz-1',
      'cust-1',
      'visit-1',
      5,
      undefined,
      NOW,
    );

    expect(result.bonusGranted).toBe(false);
  });
});

describe('RewardGoalFeedbackService — combinación visita + bonus llega a unlock', () => {
  it('reevalúa unlock después de otorgar el bonus y devuelve el estado desbloqueado', async () => {
    const deps = makeDeps({
      unlockResult: {
        status: 'unlocked',
        goalId: 'goal-1',
        incentiveName: 'Capuccino gratis',
        code: 'ABCD1234',
        expiresAt: null,
      },
    });
    const service = makeService(deps);

    const result = await service.submit(
      'biz-1',
      'cust-1',
      'visit-1',
      5,
      undefined,
      NOW,
    );

    expect(deps.unlock.evaluateUnlock).toHaveBeenCalledWith(
      'biz-1',
      'cust-1',
      NOW,
    );
    expect(result.rewardGoal).toEqual({
      goal: null,
      unlockedNow: true,
      benefit: { name: 'Capuccino gratis', code: 'ABCD1234', expiresAt: null },
    });
  });
});
