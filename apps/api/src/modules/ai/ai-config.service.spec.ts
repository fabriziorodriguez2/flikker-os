import { AiConfigService } from './ai-config.service';

const ENV_KEYS = [
  'OPENAI_API_KEY',
  'AI_MODEL',
  'AI_ENABLED',
  'AI_MAX_DAILY_GENERATIONS',
  'AI_MAX_MONTHLY_GENERATIONS',
  'AI_TIMEOUT_MS',
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

describe('AiConfigService — Fase F §3/§4: AI is always optional', () => {
  it('defaults to globally disabled with no env configured at all', () => {
    withEnv({}, () => {
      const config = new AiConfigService();
      expect(config.globallyEnabled).toBe(false);
      expect(config.providerConfigured).toBe(false);
      expect(config.apiKey).toBeNull();
    });
  });

  it('never throws when OPENAI_API_KEY is missing — Flikker must keep working', () => {
    withEnv({ AI_ENABLED: 'true' }, () => {
      expect(() => new AiConfigService()).not.toThrow();
      const config = new AiConfigService();
      expect(config.globallyEnabled).toBe(true);
      expect(config.providerConfigured).toBe(false);
    });
  });

  it('is configured once both AI_ENABLED and OPENAI_API_KEY are set', () => {
    withEnv({ AI_ENABLED: 'true', OPENAI_API_KEY: 'sk-test' }, () => {
      const config = new AiConfigService();
      expect(config.globallyEnabled).toBe(true);
      expect(config.providerConfigured).toBe(true);
    });
  });

  it('anything other than the literal "true" keeps AI disabled', () => {
    withEnv({ AI_ENABLED: 'yes', OPENAI_API_KEY: 'sk-test' }, () => {
      const config = new AiConfigService();
      expect(config.globallyEnabled).toBe(false);
    });
  });

  it('falls back to sane defaults for model and caps', () => {
    withEnv({}, () => {
      const config = new AiConfigService();
      expect(config.model).toBeTruthy();
      expect(config.maxDailyGenerationsPerBusiness).toBeGreaterThan(0);
      expect(config.maxMonthlyGenerationsPerBusiness).toBeGreaterThan(0);
      expect(config.timeoutMs).toBeGreaterThan(0);
    });
  });

  it('reads overrides from env when provided', () => {
    withEnv(
      {
        AI_MODEL: 'gpt-test-model',
        AI_MAX_DAILY_GENERATIONS: '5',
        AI_MAX_MONTHLY_GENERATIONS: '50',
        AI_TIMEOUT_MS: '1234',
      },
      () => {
        const config = new AiConfigService();
        expect(config.model).toBe('gpt-test-model');
        expect(config.maxDailyGenerationsPerBusiness).toBe(5);
        expect(config.maxMonthlyGenerationsPerBusiness).toBe(50);
        expect(config.timeoutMs).toBe(1234);
      },
    );
  });

  it('ignores a garbage numeric override and keeps the default', () => {
    withEnv({ AI_MAX_DAILY_GENERATIONS: 'not-a-number' }, () => {
      const config = new AiConfigService();
      expect(config.maxDailyGenerationsPerBusiness).toBeGreaterThan(0);
    });
  });
});
