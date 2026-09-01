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
) {
  const message = {
    id: 'message-1',
    businessId: 'business-1',
    customerId: 'customer-1',
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
    feedbackResponses: alreadySubmitted ? [{ id: 'feedback-0' }] : [],
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
    hasRecentCheckinFeedback: jest.fn().mockResolvedValue(false),
  };
  const ownerNotificationsQueue = {
    enqueueLowFeedback: jest.fn().mockResolvedValue({}),
  };
  const rewardGoalFeedback = {
    submit: jest.fn().mockResolvedValue({ bonusGranted: true }),
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
    'guarda el feedback y ofrece Google igual con score=%s',
    async (score) => {
      const { service, repository } = buildHarness();

      const result = await service.submit('token-1', { score });

      expect(repository.createFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ score }),
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
      const { service, repository, rewardGoalFeedback } =
        buildHarness(noGoogle);

      const result = await service.submit('token-1', { score: 5 });

      expect(repository.createFeedback).toHaveBeenCalled();
      expect(rewardGoalFeedback.submit).toHaveBeenCalled();
      expect(result.offerGoogle).toBe(false);
    });
  });

  it('no devuelve 404 si el cliente ya había dejado feedback', async () => {
    const { service } = buildHarness({}, true);

    const data = await service.getByToken('token-1');

    expect(data.alreadySubmitted).toBe(true);
  });

  it('el feedback se guarda aunque no se pueda otorgar el sello', async () => {
    const { service, repository, rewardGoalFeedback } = buildHarness();
    repository.findLastVisit.mockResolvedValue(null);

    const result = await service.submit('token-1', { score: 4 });

    expect(repository.createFeedback).toHaveBeenCalled();
    expect(rewardGoalFeedback.submit).not.toHaveBeenCalled();
    expect(result.bonusGranted).toBe(false);
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
});
