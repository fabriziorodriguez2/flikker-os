import { OwnerLifecycleAiSummaryService } from './owner-lifecycle-ai-summary.service';

function payload() {
  return {
    periodLabel: 'esta semana',
    newCustomers: 5,
    returningCustomers: 3,
    newReviews: 2,
    reactivation: { contacted: 10, returned: 4, recoveryRatePercent: 40 },
    benefitsRedeemed: 1,
  };
}

function makeDeps(
  options: {
    gateAllowed?: boolean;
    generateImpl?: () => Promise<unknown>;
  } = {},
) {
  const provider = {
    generateStructured: jest.fn().mockImplementation(
      options.generateImpl ??
        (() =>
          Promise.resolve({
            data: {
              text: 'Esta semana contactaste a 10 clientes y volvieron 4 (40%).',
            },
            model: 'gpt-test',
            inputTokens: 10,
            outputTokens: 10,
            latencyMs: 5,
          })),
    ),
  };
  const gate = {
    check: jest
      .fn()
      .mockResolvedValue(
        options.gateAllowed === false
          ? { allowed: false, reasonCode: 'BUSINESS_DISABLED' }
          : { allowed: true },
      ),
  };
  const usage = { record: jest.fn().mockResolvedValue('event-1') };
  return { provider, gate, usage };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new OwnerLifecycleAiSummaryService(
    deps.provider as never,
    deps.gate as never,
    deps.usage as never,
  );
}

describe('OwnerLifecycleAiSummaryService.generate — nunca bloquea el envío del email', () => {
  it('devuelve null sin llamar al provider si el gate lo niega', async () => {
    const deps = makeDeps({ gateAllowed: false });
    const service = makeService(deps);

    const result = await service.generate('biz-1', payload());

    expect(result).toBeNull();
    expect(deps.provider.generateStructured).not.toHaveBeenCalled();
  });

  it('devuelve el texto cuando el gate permite y la respuesta está grounded', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.generate('biz-1', payload());

    expect(result).toBe(
      'Esta semana contactaste a 10 clientes y volvieron 4 (40%).',
    );
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, fallbackUsed: false }),
    );
  });

  it('devuelve null y marca fallbackUsed si el texto menciona un número que no está en el payload', async () => {
    const deps = makeDeps({
      generateImpl: () =>
        Promise.resolve({
          data: { text: 'Contactaste a 999 clientes.' },
          model: 'gpt-test',
          inputTokens: 10,
          outputTokens: 10,
          latencyMs: 5,
        }),
    });
    const service = makeService(deps);

    const result = await service.generate('biz-1', payload());

    expect(result).toBeNull();
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, fallbackUsed: true }),
    );
  });

  it('devuelve null (nunca tira) si el provider falla', async () => {
    const deps = makeDeps({
      generateImpl: () => Promise.reject(new Error('timeout')),
    });
    const service = makeService(deps);

    const result = await service.generate('biz-1', payload());

    expect(result).toBeNull();
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, fallbackUsed: true }),
    );
  });
});
