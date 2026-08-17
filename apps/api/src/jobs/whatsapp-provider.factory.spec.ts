import {
  getWhatsAppProvider,
  resetWhatsAppProviderCache,
} from './whatsapp-provider.factory';
import { WhapiProvider } from './providers/whapi.provider';
import { WaSenderApiProvider } from './providers/wasender-api.provider';

describe('getWhatsAppProvider (feature flag / cutover)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetWhatsAppProviderCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetWhatsAppProviderCache();
  });

  it('defaults to Whapi when WHATSAPP_PROVIDER is unset — deploying this change alone changes nothing', () => {
    delete process.env.WHATSAPP_PROVIDER;
    expect(getWhatsAppProvider()).toBeInstanceOf(WhapiProvider);
  });

  it('selects WaSenderAPI when WHATSAPP_PROVIDER=wasender', () => {
    process.env.WHATSAPP_PROVIDER = 'wasender';
    expect(getWhatsAppProvider()).toBeInstanceOf(WaSenderApiProvider);
  });

  it('is case-insensitive', () => {
    process.env.WHATSAPP_PROVIDER = 'WaSender';
    expect(getWhatsAppProvider()).toBeInstanceOf(WaSenderApiProvider);
  });

  it('falls back to Whapi for an unknown value — never silently sends through nothing', () => {
    process.env.WHATSAPP_PROVIDER = 'some-typo';
    expect(getWhatsAppProvider()).toBeInstanceOf(WhapiProvider);
  });

  it('never dual-sends: the same call always returns the exact same instance for a given flag', () => {
    process.env.WHATSAPP_PROVIDER = 'wasender';
    const a = getWhatsAppProvider();
    const b = getWhatsAppProvider();
    expect(a).toBe(b);
  });
});
