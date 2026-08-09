import { NestFactory } from '@nestjs/core';
import { bootIsolatedSimulationContext } from './simulation-context';

jest.mock('@nestjs/core', () => ({
  NestFactory: { createApplicationContext: jest.fn() },
}));

class FakeRootModule {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('bootIsolatedSimulationContext — §1/§2: the one swap point, tightly scoped', () => {
  const originalDatabaseUrl =
    'postgresql://prod:prod@prod-host:5432/flikker_os';
  const originalOpenAiKey = 'sk-real-production-key';

  beforeEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.env.OPENAI_API_KEY = originalOpenAiKey;
    process.env.AI_ENABLED = 'true';
    (NestFactory.createApplicationContext as jest.Mock).mockReset();
  });

  it('points DATABASE_URL at the simulation URL for exactly the boot call, then restores it', async () => {
    let observedDuringBoot: string | undefined;
    (NestFactory.createApplicationContext as jest.Mock).mockImplementation(
      () => {
        observedDuringBoot = process.env.DATABASE_URL;
        return Promise.resolve({ fake: 'app' });
      },
    );

    await bootIsolatedSimulationContext(
      FakeRootModule,
      'postgresql://sim:sim@localhost:5432/flikker_simulation',
    );

    expect(observedDuringBoot).toBe(
      'postgresql://sim:sim@localhost:5432/flikker_simulation',
    );
    expect(process.env.DATABASE_URL).toBe(originalDatabaseUrl);
  });

  it('§4/§43: blanks OPENAI_API_KEY/AI_ENABLED during boot, even if production has real AI configured, then restores them', async () => {
    let observedDuringBoot: {
      key: string | undefined;
      enabled: string | undefined;
    };
    (NestFactory.createApplicationContext as jest.Mock).mockImplementation(
      () => {
        observedDuringBoot = {
          key: process.env.OPENAI_API_KEY,
          enabled: process.env.AI_ENABLED,
        };
        return Promise.resolve({ fake: 'app' });
      },
    );

    await bootIsolatedSimulationContext(
      FakeRootModule,
      'postgresql://sim:sim@localhost:5432/flikker_simulation',
    );

    expect(observedDuringBoot!.key).toBe('');
    expect(observedDuringBoot!.enabled).toBe('false');
    expect(process.env.OPENAI_API_KEY).toBe(originalOpenAiKey);
    expect(process.env.AI_ENABLED).toBe('true');
  });

  it('restores OPENAI_API_KEY/AI_ENABLED even when the boot throws', async () => {
    (NestFactory.createApplicationContext as jest.Mock).mockRejectedValue(
      new Error('boom'),
    );

    await expect(
      bootIsolatedSimulationContext(FakeRootModule, 'sim-url'),
    ).rejects.toThrow('boom');

    expect(process.env.OPENAI_API_KEY).toBe(originalOpenAiKey);
    expect(process.env.AI_ENABLED).toBe('true');
  });

  it('restores an originally-unset OPENAI_API_KEY back to unset (never leaves a stray empty string)', async () => {
    delete process.env.OPENAI_API_KEY;
    (NestFactory.createApplicationContext as jest.Mock).mockResolvedValue({
      fake: 'app',
    });

    await bootIsolatedSimulationContext(FakeRootModule, 'sim-url');

    expect(process.env.OPENAI_API_KEY).toBeUndefined();
  });

  it('restores the real DATABASE_URL even when the boot throws', async () => {
    (NestFactory.createApplicationContext as jest.Mock).mockRejectedValue(
      new Error('boom'),
    );

    await expect(
      bootIsolatedSimulationContext(
        FakeRootModule,
        'postgresql://sim:sim@localhost:5432/flikker_simulation',
      ),
    ).rejects.toThrow('boom');

    expect(process.env.DATABASE_URL).toBe(originalDatabaseUrl);
  });

  it('never lets two overlapping boots interleave the swap window', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const callOrder: string[] = [];

    (NestFactory.createApplicationContext as jest.Mock)
      .mockImplementationOnce(() => {
        callOrder.push('A-start');
        return first.promise.then((value) => {
          callOrder.push('A-end');
          return value;
        });
      })
      .mockImplementationOnce(() => {
        callOrder.push('B-start');
        return second.promise.then((value) => {
          callOrder.push('B-end');
          return value;
        });
      });

    const runA = bootIsolatedSimulationContext(FakeRootModule, 'sim-url-A');
    const runB = bootIsolatedSimulationContext(FakeRootModule, 'sim-url-B');

    // Resolve both deferreds up front, inside `finally`, so this test can
    // never leave the module-level boot queue stuck on an unsettled promise
    // for the next test — even if the assertion below fails.
    try {
      // A couple of microtask turns — B must not have started yet: it sits
      // queued strictly behind A's full settlement (including A's own
      // `finally` env-restore), never invoked while A is still in flight.
      await Promise.resolve();
      await Promise.resolve();
      expect(callOrder).toEqual(['A-start']);
    } finally {
      first.resolve({ fake: 'app-a' });
      second.resolve({ fake: 'app-b' });
    }

    await runA;
    await runB;

    expect(callOrder).toEqual(['A-start', 'A-end', 'B-start', 'B-end']);
    expect(process.env.DATABASE_URL).toBe(originalDatabaseUrl);
  });

  it('a failed boot does not block the next caller from booting', async () => {
    (NestFactory.createApplicationContext as jest.Mock)
      .mockRejectedValueOnce(new Error('first boot failed'))
      .mockResolvedValueOnce({ fake: 'app' });

    await expect(
      bootIsolatedSimulationContext(FakeRootModule, 'sim-url-A'),
    ).rejects.toThrow('first boot failed');

    const second = await bootIsolatedSimulationContext(
      FakeRootModule,
      'sim-url-B',
    );
    expect(second).toEqual({ fake: 'app' });
    expect(process.env.DATABASE_URL).toBe(originalDatabaseUrl);
  });
});
