import { NotFoundException } from '@nestjs/common';
import { ExperienceVersion } from '@prisma/client';
import { FeedbackService } from './feedback.service';

type BusinessOverrides = {
  experienceVersion?: ExperienceVersion;
  googleBusinessProfileUrl?: string | null;
  defaultReviewRedirectUrl?: string | null;
};

const GOOGLE_URL = 'https://g.page/r/example/review';

function buildHarness(
  business: BusinessOverrides = {},
  alreadySubmitted = false,
  originatingVisitId: string | null = null,
) {
  const isV2 =
    (business.experienceVersion ?? ExperienceVersion.CHECKIN_V2) ===
    ExperienceVersion.CHECKIN_V2;

  const message = {
    id: 'message-1',
    businessId: 'business-1',
    customerId: 'customer-1',
    // `null`: mismo caso que un mensaje anterior a la columna — el fallback
    // a `findLastVisit` es lo que se prueba por default.
    originatingVisitId,
    business: {
      id: 'business-1',
      name: 'Bar Fraternidad',
      logoUrl: null,
      experienceVersion:
        business.experienceVersion ?? ExperienceVersion.CHECKIN_V2,
      googleBusinessProfileUrl:
        business.googleBusinessProfileUrl === undefined
          ? GOOGLE_URL
          : business.googleBusinessProfileUrl,
      defaultReviewRedirectUrl: business.defaultReviewRedirectUrl ?? null,
    },
    customer: { id: 'customer-1' },
    // Fuente de verdad SOLO para LEGACY. V2 nunca la mira — ver
    // `hasFeedbackForVisit` más abajo.
    feedbackResponses: !isV2 && alreadySubmitted ? [{ id: 'feedback-0' }] : [],
  };

  const repository = {
    findMessageByToken: jest.fn().mockResolvedValue(message),
    markClicked: jest.fn().mockResolvedValue({}),
    createFeedback: jest
      .fn()
      .mockImplementation((data: { redirectedToGoogle: boolean }) =>
        Promise.resolve({ id: 'feedback-1', ...data }),
      ),
    findLastVisit: jest.fn().mockResolvedValue({ id: 'visit-1' }),
    // Única fuente de verdad de "ya contestó" para V2 — la MISMA tabla que
    // llena la card de feedback dentro del check-in.
    hasFeedbackForVisit: jest.fn().mockResolvedValue(isV2 && alreadySubmitted),
  };
  const ownerNotificationsQueue = {
    enqueueLowFeedback: jest.fn().mockResolvedValue({}),
  };
  const rewardGoalFeedback = {
    // `offerGoogle: true` — el servicio real SIEMPRE lo devuelve así (Google
    // se ofrece con cualquier puntaje); es `FeedbackService` quien lo apaga
    // si el negocio no tiene Google conectado.
    submit: jest.fn().mockResolvedValue({
      bonusGranted: true,
      alreadySubmitted: false,
      offerGoogle: true,
    }),
  };

  const service = new FeedbackService(
    repository as never,
    ownerNotificationsQueue as never,
    rewardGoalFeedback as never,
  );

  return { service, repository, rewardGoalFeedback, ownerNotificationsQueue };
}

describe('FeedbackService — Check-in V2', () => {
  // Test 5 y 6 del pedido: un 1 estrella y un 5 estrellas se comportan
  // EXACTAMENTE igual respecto de Google. Nada de selective solicitation.
  it.each([1, 5])(
    'guarda el feedback (vía el read-model V2) y ofrece Google igual con score=%s',
    async (score) => {
      const { service, rewardGoalFeedback } = buildHarness();

      const result = await service.submit('token-1', { score });

      // El read-model REAL de V2 es `RewardGoalFeedbackService` — el mismo
      // que usa la card del check-in — nunca `FeedbackResponse`.
      expect(rewardGoalFeedback.submit).toHaveBeenCalledWith(
        'business-1',
        'customer-1',
        'visit-1',
        score,
        undefined,
      );
      expect(result.offerGoogle).toBe(true);
      // `redirectedToGoogle` deja de codificar el gating en V2.
      expect(result.redirectedToGoogle).toBe(false);
    },
  );

  it('nunca condiciona la oferta de Google al puntaje', async () => {
    const results: Array<boolean | undefined> = [];
    for (const score of [1, 2, 3, 4, 5]) {
      const { service } = buildHarness();
      results.push((await service.submit('token-1', { score })).offerGoogle);
    }
    expect(results).toEqual([true, true, true, true, true]);
  });

  // Test 7 del pedido.
  it('otorga el sello por el feedback, no por ir a Google', async () => {
    const { service, rewardGoalFeedback } = buildHarness();

    const result = await service.submit('token-1', {
      score: 1,
      comment: '  no me gustó  ',
    });

    // Se llama al MISMO servicio que la card del check-in, atado a la visita
    // real, y ocurre dentro del submit — antes de que exista cualquier
    // navegación externa.
    expect(rewardGoalFeedback.submit).toHaveBeenCalledWith(
      'business-1',
      'customer-1',
      'visit-1',
      1,
      'no me gustó',
    );
    expect(result.bonusGranted).toBe(true);
  });

  // Test 8 del pedido.
  describe('negocio sin Google conectado', () => {
    const noGoogle = {
      googleBusinessProfileUrl: null,
      defaultReviewRedirectUrl: null,
    };

    it('no devuelve 404 al abrir el link', async () => {
      const { service } = buildHarness(noGoogle);

      const data = await service.getByToken('token-1');

      expect(data.googleReviewUrl).toBeNull();
      expect(data.experienceVersion).toBe(ExperienceVersion.CHECKIN_V2);
    });

    it('guarda el feedback igual y no ofrece un enlace roto', async () => {
      const { service, rewardGoalFeedback } = buildHarness(noGoogle);

      const result = await service.submit('token-1', { score: 5 });

      expect(rewardGoalFeedback.submit).toHaveBeenCalled();
      expect(result.offerGoogle).toBe(false);
    });
  });

  it('no devuelve 404 si el cliente ya había dejado feedback (inline, en el check-in)', async () => {
    // `alreadySubmitted` acá viene de `CheckinFeedback` (la card inline), NO
    // de una `FeedbackResponse` previa por este mismo link — es exactamente
    // el caso que antes se perdía: contestó adentro del check-in, después
    // abrió el recordatorio.
    const { service, repository } = buildHarness({}, true);

    const data = await service.getByToken('token-1');

    expect(data.alreadySubmitted).toBe(true);
    expect(repository.hasFeedbackForVisit).toHaveBeenCalledWith('visit-1');
  });

  it('resuelve la visita por originatingVisitId cuando el mensaje lo tiene', async () => {
    const { service, repository } = buildHarness({}, false, 'visit-original');

    await service.getByToken('token-1');

    // Nunca recurre a `findLastVisit` — la visita que originó el mensaje ya
    // se conoce, no hace falta adivinar "la última".
    expect(repository.findLastVisit).not.toHaveBeenCalled();
    expect(repository.hasFeedbackForVisit).toHaveBeenCalledWith(
      'visit-original',
    );
  });

  it('sin ninguna visita a la que atar el feedback, el submit devuelve 404 en vez de perderlo silenciosamente', async () => {
    const { service, repository, rewardGoalFeedback } = buildHarness();
    repository.findLastVisit.mockResolvedValue(null);

    await expect(
      service.submit('token-1', { score: 4 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rewardGoalFeedback.submit).not.toHaveBeenCalled();
  });
});

/**
 * Fuente única de verdad (pedido explícito): V2 nunca escribe
 * `FeedbackResponse` — ni con puntaje bajo ni alto — y `FeedbackService`
 * nunca encola el aviso de feedback bajo por su cuenta: eso ahora es
 * responsabilidad exclusiva de `RewardGoalFeedbackService.submit` (probado
 * en `reward-goal-feedback.service.spec.ts`), el único punto por el que
 * pasan tanto este link como la card dentro del check-in.
 */
describe('FeedbackService — Check-in V2: sin dual-write', () => {
  it.each([1, 2, 3, 4, 5])(
    'score=%i: nunca crea una FeedbackResponse',
    async (score) => {
      const { service, repository } = buildHarness();

      await service.submit('token-1', { score });

      expect(repository.createFeedback).not.toHaveBeenCalled();
    },
  );

  it('nunca encola el aviso de feedback bajo por su cuenta — eso lo hace RewardGoalFeedbackService', async () => {
    const { service, ownerNotificationsQueue } = buildHarness();

    await service.submit('token-1', { score: 1 });

    expect(ownerNotificationsQueue.enqueueLowFeedback).not.toHaveBeenCalled();
  });

  it('replay (RewardGoalFeedbackService ya tiene el feedback): tampoco crea FeedbackResponse ni pisa el resultado', async () => {
    const { service, repository, rewardGoalFeedback } = buildHarness();
    rewardGoalFeedback.submit.mockResolvedValue({
      bonusGranted: false,
      alreadySubmitted: true,
      offerGoogle: true,
    });

    const result = await service.submit('token-1', { score: 5 });

    expect(repository.createFeedback).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});

describe('FeedbackService — LEGACY sin cambios', () => {
  const legacy = { experienceVersion: ExperienceVersion.LEGACY };

  it('sigue devolviendo 404 si ya se envió feedback', async () => {
    const { service } = buildHarness(legacy, true);
    await expect(service.getByToken('token-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('sigue devolviendo 404 si el negocio no tiene Google', async () => {
    const { service } = buildHarness({
      ...legacy,
      googleBusinessProfileUrl: null,
      defaultReviewRedirectUrl: null,
    });
    await expect(service.getByToken('token-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('conserva el gating histórico en `redirectedToGoogle` y no da sellos', async () => {
    const { service, rewardGoalFeedback } = buildHarness(legacy);

    const low = await service.submit('token-1', { score: 3 });
    expect(low.redirectedToGoogle).toBe(false);
    expect(low.offerGoogle).toBeUndefined();

    const high = await buildHarness(legacy).service.submit('token-1', {
      score: 5,
    });
    expect(high.redirectedToGoogle).toBe(true);

    expect(rewardGoalFeedback.submit).not.toHaveBeenCalled();
  });

  it('sigue escribiendo FeedbackResponse — nunca CheckinFeedback', async () => {
    const { service, repository, rewardGoalFeedback } = buildHarness(legacy);

    await service.submit('token-1', { score: 2 });

    expect(repository.createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ score: 2, redirectedToGoogle: false }),
    );
    expect(rewardGoalFeedback.submit).not.toHaveBeenCalled();
  });
});
