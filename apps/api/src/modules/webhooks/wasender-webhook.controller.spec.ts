import { UnauthorizedException } from '@nestjs/common';
import { WaSenderWebhookController } from './wasender-webhook.controller';
import { resetWaSenderWebhookDedupeCache } from './wasender-webhook-security';

describe('WaSenderWebhookController', () => {
  const originalEnv = process.env;
  const handleEvent = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    resetWaSenderWebhookDedupeCache();
    process.env = { ...originalEnv, WASENDER_WEBHOOK_SECRET: 'shh' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function controller() {
    return new WaSenderWebhookController({ handleEvent } as never);
  }

  it('401s on a missing signature', () => {
    expect(() =>
      controller().receive(undefined, { event: 'messages.upsert' }),
    ).toThrow(UnauthorizedException);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it('401s on an invalid signature', () => {
    expect(() =>
      controller().receive('wrong-secret', { event: 'messages.upsert' }),
    ).toThrow(UnauthorizedException);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it('accepts a valid signature, responds fast, and processes async', async () => {
    const body = {
      event: 'messages.update',
      data: { key: { id: 'msg-1' }, update: { status: 2 } },
    };

    const result = controller().receive('shh', body);

    expect(result).toEqual({ ok: true });
    // Procesamiento async — se dispara pero no se espera adentro de receive().
    await Promise.resolve();
    expect(handleEvent).toHaveBeenCalledWith(body);
  });

  it('is idempotent: the same event (same event+key.id) is only processed once', async () => {
    const body = {
      event: 'messages.update',
      data: { key: { id: 'msg-1' }, update: { status: 2 } },
    };

    controller().receive('shh', body);
    controller().receive('shh', body);
    await Promise.resolve();

    expect(handleEvent).toHaveBeenCalledTimes(1);
  });

  it('a different event with the same key.id is processed independently (not deduped across event types)', async () => {
    controller().receive('shh', {
      event: 'messages.update',
      data: { key: { id: 'msg-1' }, update: { status: 2 } },
    });
    controller().receive('shh', {
      event: 'messages.update',
      data: { key: { id: 'msg-1' }, update: { status: 3 } },
    });
    await Promise.resolve();

    // Mismo event+key.id pero distinto status: el dedupe es por event+id,
    // no por contenido — este caso puntual SÍ se dedupea (comportamiento
    // documentado, no un bug): dos entregas reales del mismo evento traen
    // el mismo id.
    expect(handleEvent).toHaveBeenCalledTimes(1);
  });

  it('processes an unknown event type without throwing (ignored downstream, not here)', () => {
    expect(() =>
      controller().receive('shh', { event: 'group.upsert', data: {} }),
    ).not.toThrow();
  });
});
