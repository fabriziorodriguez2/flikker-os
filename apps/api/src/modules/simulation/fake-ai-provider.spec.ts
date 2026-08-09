import { AiProviderError } from '../ai/ai-provider.interface';
import { createSeededRandom } from './prng';
import { FakeAiProvider } from './fake-ai-provider';

const REQUEST = {
  useCase: 'RETENTION_MESSAGE_COPY' as never,
  systemPrompt: 'system',
  userPayload: { foo: 'bar' },
  schema: { name: 'test_schema', schema: {} },
  promptVersion: 'v1',
  temperature: 0.3,
  maxOutputTokens: 200,
  timeoutMs: 5000,
};

describe('FakeAiProvider — §4/§17/§19: never real network, always seeded', () => {
  it('is configured by default, mirroring a real configured provider', () => {
    const provider = new FakeAiProvider({ rng: createSeededRandom(1) });
    expect(provider.configured).toBe(true);
  });

  it('throws NOT_CONFIGURED when configured=false, without ever rolling the rng', () => {
    const provider = new FakeAiProvider({
      rng: createSeededRandom(1),
      configured: false,
    });
    return expect(provider.generateStructured(REQUEST)).rejects.toMatchObject({
      reason: 'NOT_CONFIGURED',
    });
  });

  it('never fails when failureRate is 0', async () => {
    const provider = new FakeAiProvider({
      rng: createSeededRandom(2),
      failureRate: 0,
    });
    for (let i = 0; i < 50; i++) {
      await expect(provider.generateStructured(REQUEST)).resolves.toBeDefined();
    }
    expect(provider.failureCount).toBe(0);
    expect(provider.callCount).toBe(50);
  });

  it('§19: always fails when failureRate is 1.0 — the AI_PROVIDER_FAILURE scenario', async () => {
    const provider = new FakeAiProvider({
      rng: createSeededRandom(3),
      failureRate: 1,
    });
    for (let i = 0; i < 20; i++) {
      await expect(provider.generateStructured(REQUEST)).rejects.toThrow(
        AiProviderError,
      );
    }
    expect(provider.failureCount).toBe(20);
    expect(provider.callCount).toBe(20);
  });

  it('counts every attempted call, success or failure', async () => {
    const provider = new FakeAiProvider({
      rng: createSeededRandom(4),
      failureRate: 0.5,
    });
    for (let i = 0; i < 30; i++) {
      await provider.generateStructured(REQUEST).catch(() => undefined);
    }
    expect(provider.callCount).toBe(30);
    expect(provider.failureCount).toBeGreaterThan(0);
    expect(provider.failureCount).toBeLessThan(30);
  });

  it('never performs real network I/O — returns synchronously-derived fake data', async () => {
    const provider = new FakeAiProvider({
      rng: createSeededRandom(5),
      failureRate: 0,
      responder: () => ({ subject: 'fake', body: 'fake copy' }) as never,
    });
    const result = await provider.generateStructured(REQUEST);
    expect(result.data).toEqual({ subject: 'fake', body: 'fake copy' });
    expect(result.model).toBe('fake-simulation-model');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('is fully reproducible for the same seed', async () => {
    const makeProvider = (rng: ReturnType<typeof createSeededRandom>) =>
      new FakeAiProvider({ rng, failureRate: 0.5 });
    const a = makeProvider(createSeededRandom(9));
    const b = makeProvider(createSeededRandom(9));
    const outcomesA: boolean[] = [];
    const outcomesB: boolean[] = [];
    for (let i = 0; i < 20; i++) {
      outcomesA.push(
        await a
          .generateStructured(REQUEST)
          .then(() => true)
          .catch(() => false),
      );
      outcomesB.push(
        await b
          .generateStructured(REQUEST)
          .then(() => true)
          .catch(() => false),
      );
    }
    expect(outcomesA).toEqual(outcomesB);
  });
});
