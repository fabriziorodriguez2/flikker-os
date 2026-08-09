import { SimulationConfigService } from './simulation-config.service';

const ENV_KEYS = [
  'SIMULATION_ENABLED',
  'SIMULATION_DATABASE_URL',
  'SIMULATION_MAX_CONCURRENT_RUNS',
  'SIMULATION_MAX_CUSTOMERS',
  'SIMULATION_MAX_DAYS',
];

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const original: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) original[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, vars);
  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

describe('SimulationConfigService — §2/§3/§42: hard-off unless fully configured', () => {
  it('is unavailable with no env configured at all (safe default: OFF)', () => {
    withEnv({}, () => {
      const config = new SimulationConfigService();
      expect(config.enabled).toBe(false);
      expect(config.databaseUrl).toBeNull();
      expect(config.available).toBe(false);
      expect(config.unavailableReason).toBe('DISABLED');
    });
  });

  it('never throws when unconfigured — the app must keep booting normally', () => {
    withEnv({}, () => {
      expect(() => new SimulationConfigService()).not.toThrow();
    });
  });

  it('stays unavailable when enabled but no dedicated simulation database is set', () => {
    withEnv({ SIMULATION_ENABLED: 'true' }, () => {
      const config = new SimulationConfigService();
      expect(config.enabled).toBe(true);
      expect(config.available).toBe(false);
      expect(config.unavailableReason).toBe('DATABASE_NOT_CONFIGURED');
    });
  });

  it('is available once both the kill switch and a simulation database are set', () => {
    withEnv(
      {
        SIMULATION_ENABLED: 'true',
        SIMULATION_DATABASE_URL:
          'postgresql://sim:sim@localhost:5432/flikker_simulation',
      },
      () => {
        const config = new SimulationConfigService();
        expect(config.available).toBe(true);
        expect(config.unavailableReason).toBeNull();
      },
    );
  });

  it('anything other than the literal "true" keeps it disabled', () => {
    withEnv(
      {
        SIMULATION_ENABLED: 'yes',
        SIMULATION_DATABASE_URL: 'postgresql://sim:sim@localhost:5432/sim',
      },
      () => {
        const config = new SimulationConfigService();
        expect(config.enabled).toBe(false);
        expect(config.available).toBe(false);
      },
    );
  });

  it('§2: NEVER falls back to DATABASE_URL when SIMULATION_DATABASE_URL is missing', () => {
    withEnv({ SIMULATION_ENABLED: 'true' }, () => {
      process.env.DATABASE_URL =
        'postgresql://prod:prod@prod-host:5432/flikker_os';
      const config = new SimulationConfigService();
      expect(config.databaseUrl).toBeNull();
      expect(config.databaseUrl).not.toBe(process.env.DATABASE_URL);
      expect(config.available).toBe(false);
    });
  });

  it('falls back to sane defaults for the numeric limits', () => {
    withEnv({}, () => {
      const config = new SimulationConfigService();
      expect(config.maxConcurrentRuns).toBeGreaterThan(0);
      expect(config.maxCustomers).toBeGreaterThan(0);
      expect(config.maxDays).toBeGreaterThan(0);
    });
  });

  it('reads numeric overrides from env when provided', () => {
    withEnv(
      {
        SIMULATION_MAX_CONCURRENT_RUNS: '3',
        SIMULATION_MAX_CUSTOMERS: '250',
        SIMULATION_MAX_DAYS: '30',
      },
      () => {
        const config = new SimulationConfigService();
        expect(config.maxConcurrentRuns).toBe(3);
        expect(config.maxCustomers).toBe(250);
        expect(config.maxDays).toBe(30);
      },
    );
  });

  it('ignores a garbage numeric override and keeps the default', () => {
    withEnv({ SIMULATION_MAX_DAYS: 'not-a-number' }, () => {
      const config = new SimulationConfigService();
      expect(config.maxDays).toBeGreaterThan(0);
    });
  });

  it('trims whitespace from the simulation database URL', () => {
    withEnv(
      {
        SIMULATION_DATABASE_URL: '  postgresql://sim:sim@localhost:5432/sim  ',
      },
      () => {
        const config = new SimulationConfigService();
        expect(config.databaseUrl).toBe(
          'postgresql://sim:sim@localhost:5432/sim',
        );
      },
    );
  });
});
