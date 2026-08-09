import { AiRecommendationExplanationService } from './recommendation-explanation.service';
import { AiProviderError } from './ai-provider.interface';

function variantResult(overrides: Record<string, unknown> = {}) {
  return {
    variantId: 'var-control',
    variantName: 'Control',
    strategyType: 'CONTROL',
    stats: { evidenceState: 'ENOUGH_DATA', returnRate: 0.1 },
    economics: { estimatedNetIncrementalValue: null },
    upliftPercentagePoints: null,
    estimatedIncrementalReturns: null,
    significanceVsControl: null,
    ...overrides,
  };
}

function experimentResults(overrides: Record<string, unknown> = {}) {
  return {
    experimentId: 'exp-1',
    experimentName: 'Upgrade vs 10% OFF',
    attributionWindowDays: 30,
    controlVariantId: 'var-control',
    winner: { kind: 'BEST_INCREMENTAL_VALUE', variantId: 'var-upgrade' },
    variants: [
      variantResult(),
      variantResult({
        variantId: 'var-upgrade',
        variantName: 'Upgrade',
        strategyType: 'SOFT_BENEFIT',
        stats: { evidenceState: 'ENOUGH_DATA', returnRate: 0.22 },
        economics: { estimatedNetIncrementalValue: 2800 },
      }),
      variantResult({
        variantId: 'var-discount',
        variantName: '10% OFF',
        strategyType: 'STRONG_BENEFIT',
        stats: { evidenceState: 'ENOUGH_DATA', returnRate: 0.23 },
        economics: { estimatedNetIncrementalValue: 1900 },
      }),
    ],
    ...overrides,
  };
}

function makeDeps(
  options: {
    gateAllowed?: boolean;
    providerResult?: { headline: string; explanation: string };
    providerError?: unknown;
    results?: unknown;
  } = {},
) {
  const provider = {
    generateStructured: options.providerError
      ? jest.fn().mockRejectedValue(options.providerError)
      : jest.fn().mockResolvedValue({
          data: options.providerResult ?? {
            headline: 'El upgrade está rindiendo mejor',
            explanation:
              'El upgrade consigue un retorno similar al descuento, pero con mejor valor económico estimado.',
          },
          model: 'gpt-4o-mini',
          inputTokens: 60,
          outputTokens: 30,
          latencyMs: 400,
        }),
  };
  const gate = {
    check: jest
      .fn()
      .mockResolvedValue(
        options.gateAllowed === false
          ? { allowed: false, reasonCode: 'PLATFORM_DISABLED' }
          : { allowed: true },
      ),
  };
  const usage = { record: jest.fn().mockResolvedValue('usage-1') };
  const metrics = {
    forExperiment: jest
      .fn()
      .mockResolvedValue(options.results ?? experimentResults()),
  };
  return { provider, gate, usage, metrics };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new AiRecommendationExplanationService(
    deps.provider as never,
    deps.gate as never,
    deps.usage as never,
    deps.metrics as never,
  );
}

describe('AiRecommendationExplanationService — Fase F §20-22: explains, never recomputes', () => {
  it('returns null when the gate denies — the caller shows numbers with no prose, never breaks', async () => {
    const deps = makeDeps({ gateAllowed: false });
    const service = makeService(deps);

    const result = await service.explain('biz-1', 'exp-1');

    expect(result).toBeNull();
    expect(deps.provider.generateStructured).not.toHaveBeenCalled();
  });

  it('returns null (no throw) when the provider fails', async () => {
    const deps = makeDeps({
      providerError: new AiProviderError('boom', 'HTTP_ERROR'),
    });
    const service = makeService(deps);

    const result = await service.explain('biz-1', 'exp-1');

    expect(result).toBeNull();
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it('returns the AI explanation when it is consistent with the engine winner', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.explain('biz-1', 'exp-1');

    expect(result).toEqual({
      headline: 'El upgrade está rindiendo mejor',
      explanation:
        'El upgrade consigue un retorno similar al descuento, pero con mejor valor económico estimado.',
      copySource: 'AI',
    });
  });

  it('never recomputes the winner — the facts sent to the model always come from RetentionExperimentMetricsService', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.explain('biz-1', 'exp-1');

    expect(deps.metrics.forExperiment).toHaveBeenCalledWith('biz-1', 'exp-1');
    const [request] = deps.provider.generateStructured.mock.calls[0];
    expect(request.userPayload.recommendation).toBe('BEST_INCREMENTAL_VALUE');
    expect(request.userPayload.recommendedVariantName).toBe('Upgrade');
  });
});

describe('AiRecommendationExplanationService — Fase F §21/§50: rejects a contradicting explanation', () => {
  it('rejects when the AI recommends a DIFFERENT variant than the engine winner', async () => {
    const deps = makeDeps({
      providerResult: {
        headline: 'El descuento es mejor',
        explanation: 'Recomendamos usar 10% OFF porque convierte más.',
      },
    });
    const service = makeService(deps);

    const result = await service.explain('biz-1', 'exp-1');

    expect(result).toBeNull();
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, fallbackUsed: true }),
    );
  });

  it('accepts an explanation that mentions the loser by name but recommends the actual winner', async () => {
    const deps = makeDeps({
      providerResult: {
        headline: 'El upgrade rinde mejor',
        explanation:
          'Aunque 10% OFF tuvo un retorno apenas mayor, conviene el Upgrade por su mejor valor económico.',
      },
    });
    const service = makeService(deps);

    const result = await service.explain('biz-1', 'exp-1');

    expect(result).not.toBeNull();
    expect(result?.copySource).toBe('AI');
  });

  it('never changes the recommendation itself even when explanation text is rejected', async () => {
    const deps = makeDeps({
      providerResult: {
        headline: 'El descuento es mejor',
        explanation: 'Recomendamos 10% OFF.',
      },
    });
    const service = makeService(deps);

    await service.explain('biz-1', 'exp-1');

    // The engine's own winner was never touched — nothing here calls into
    // any write path, forExperiment is read-only and called exactly once.
    expect(deps.metrics.forExperiment).toHaveBeenCalledTimes(1);
  });
});
