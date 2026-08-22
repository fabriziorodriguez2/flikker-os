import { MessageStatus, RetentionObjective } from '@prisma/client';
import { RetentionV2MessageDispatchService } from './retention-v2-message-dispatch.service';
import { buildMiFlikkerLink } from '../public/public-messaging.service';

const NOW = new Date('2026-09-02T15:00:00.000Z');
/** Se agrega al final de CUALQUIER WhatsApp que este servicio manda — ver el `sendText` real. */
const miFlikkerSuffix = `\n\nVas todos tus premios y lugares en Mi Flikker: ${buildMiFlikkerLink()}`;

const DEFAULT_SETTINGS = {
  automaticCampaignsEnabled: true,
  progressReminderEnabled: true,
  dryRunEnabled: false,
};

function messageFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    businessId: 'biz-1',
    customerId: 'cust-1',
    status: MessageStatus.queued,
    body: 'Hace tiempo que no venís. Te esperamos de vuelta.',
    business: {
      id: 'biz-1',
      name: 'Café Test',
      timezone: 'America/Montevideo',
      retentionEngineV2Enabled: true,
      messageQuotaMonthly: 600,
      messageCountCurrentMonth: 10,
    },
    customer: {
      id: 'cust-1',
      name: 'Cliente Test',
      email: null,
      optedOut: false,
      phoneE164: '+59891111111',
    },
    retentionAssignment: {
      id: 'assign-1',
      experiment: { objective: RetentionObjective.AT_RISK_RECOVERY },
    },
    ...overrides,
  };
}

function makeDeps(message: unknown = messageFixture()) {
  const prisma = {
    message: {
      findUnique: jest.fn().mockResolvedValue(message),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    business: {
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((arr: Promise<unknown>[]) => Promise.all(arr)),
  };
  const settings = {
    getOrCreate: jest.fn().mockResolvedValue(DEFAULT_SETTINGS),
    isWithinSendingWindow: jest.fn().mockReturnValue(true),
  };
  const decisions = { record: jest.fn().mockResolvedValue(undefined) };
  const whatsApp = {
    sendText: jest.fn().mockResolvedValue({ whatsappMessageId: 'wa-1' }),
    isChannelAvailable: jest.fn().mockResolvedValue(true),
  };
  // El fixture de customer no trae `email`, así que `maybeSendEmail` corta
  // antes de llegar a preguntarle a `plans` — estos mocks solo existen para
  // satisfacer el constructor, no participan en las aserciones de arriba.
  const lifecycleEmails = { sendOnce: jest.fn().mockResolvedValue('sent') };
  const plans = { hasProAccess: jest.fn().mockResolvedValue(false) };
  const cooldown = {
    reserve: jest.fn().mockResolvedValue('reserved'),
    confirm: jest.fn().mockResolvedValue('confirmed'),
  };
  return {
    prisma,
    settings,
    decisions,
    whatsApp,
    lifecycleEmails,
    plans,
    cooldown,
  };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RetentionV2MessageDispatchService(
    deps.prisma as never,
    deps.settings as never,
    deps.decisions as never,
    deps.whatsApp as never,
    deps.lifecycleEmails as never,
    deps.plans as never,
    deps.cooldown as never,
  );
}

function loggedCodes(deps: ReturnType<typeof makeDeps>): string[] {
  return deps.decisions.record.mock.calls.map(
    (c) => (c[0] as { decisionCode: string }).decisionCode,
  );
}

describe('RetentionV2MessageDispatchService — normal send', () => {
  it('sends the exact composed body over WhatsApp and marks the message sent', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({ status: 'sent', whatsappMessageId: 'wa-1' });
    expect(deps.whatsApp.sendText).toHaveBeenCalledWith({
      phone: '+59891111111',
      text: `Hace tiempo que no venís. Te esperamos de vuelta.${miFlikkerSuffix}`,
    });
    expect(loggedCodes(deps)).toContain('MESSAGE_SENT');
  });

  it('increments the monthly message count on a real send', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);

    expect(deps.prisma.business.update).toHaveBeenCalledWith({
      where: { id: 'biz-1' },
      data: { messageCountCurrentMonth: { increment: 1 } },
    });
  });

  it('claims the message atomically before calling the provider', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);

    expect(deps.prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: 'msg-1', status: MessageStatus.queued },
      data: { status: MessageStatus.sending },
    });
  });

  it('a reminder-only message and a benefit-carrying message use the exact same transport', async () => {
    // The dispatcher never looks at strategyType/incentive — only body + phone.
    const reminderDeps = makeDeps(
      messageFixture({ id: 'msg-reminder', body: 'Te extrañamos 💜' }),
    );
    const benefitDeps = makeDeps(
      messageFixture({
        id: 'msg-benefit',
        body: 'Te extrañamos — tenés 10% en tu próxima visita 💜',
      }),
    );

    await makeService(reminderDeps).dispatch('msg-reminder', NOW);
    await makeService(benefitDeps).dispatch('msg-benefit', NOW);

    expect(reminderDeps.whatsApp.sendText).toHaveBeenCalledWith({
      phone: '+59891111111',
      text: `Te extrañamos 💜${miFlikkerSuffix}`,
    });
    expect(benefitDeps.whatsApp.sendText).toHaveBeenCalledWith({
      phone: '+59891111111',
      text: `Te extrañamos — tenés 10% en tu próxima visita 💜${miFlikkerSuffix}`,
    });
  });
});

describe('RetentionV2MessageDispatchService — scoping', () => {
  it('never touches a Message that is not a Retention V2 message', async () => {
    const deps = makeDeps(messageFixture({ retentionAssignment: null }));
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({ status: 'not_retention_v2' });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
    expect(deps.prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op for a message that no longer exists', async () => {
    const deps = makeDeps();
    deps.prisma.message.findUnique.mockResolvedValue(null);
    const service = makeService(deps);

    const result = await service.dispatch('missing', NOW);

    expect(result).toEqual({ status: 'skipped', reasonCode: 'NOT_FOUND' });
  });
});

describe('RetentionV2MessageDispatchService — dry run', () => {
  it('never sends when dry run is on', async () => {
    const deps = makeDeps();
    deps.settings.getOrCreate.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      dryRunEnabled: true,
    });
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({ status: 'skipped', reasonCode: 'DRY_RUN' });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });
});

describe('RetentionV2MessageDispatchService — engine / automation gates', () => {
  it('does not send when the business kill switch is off', async () => {
    const deps = makeDeps(
      messageFixture({
        business: {
          id: 'biz-1',
          timezone: 'America/Montevideo',
          retentionEngineV2Enabled: false,
          messageQuotaMonthly: 600,
          messageCountCurrentMonth: 0,
        },
      }),
    );
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'AUTOMATION_DISABLED',
    });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('does not send a recovery message when "Te extrañamos" is off', async () => {
    const deps = makeDeps();
    deps.settings.getOrCreate.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      automaticCampaignsEnabled: false,
    });
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'AUTOMATION_DISABLED',
    });
  });

  it('does not send a progress reminder when "Cerca del premio" is off, even if recovery is on', async () => {
    const deps = makeDeps(
      messageFixture({
        retentionAssignment: {
          id: 'assign-1',
          experiment: { objective: RetentionObjective.REWARD_GOAL_PROGRESS },
        },
      }),
    );
    deps.settings.getOrCreate.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      automaticCampaignsEnabled: true,
      progressReminderEnabled: false,
    });
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'AUTOMATION_DISABLED',
    });
  });

  it('sends a progress reminder when only "Cerca del premio" is on', async () => {
    const deps = makeDeps(
      messageFixture({
        retentionAssignment: {
          id: 'assign-1',
          experiment: { objective: RetentionObjective.REWARD_GOAL_PROGRESS },
        },
      }),
    );
    deps.settings.getOrCreate.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      automaticCampaignsEnabled: false,
      progressReminderEnabled: true,
    });
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result.status).toBe('sent');
  });
});

describe('RetentionV2MessageDispatchService — opt-out', () => {
  it('never sends to an opted-out customer, even if it was queued before the opt-out', async () => {
    const deps = makeDeps(
      messageFixture({
        customer: { id: 'cust-1', optedOut: true, phoneE164: '+59891111111' },
      }),
    );
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({ status: 'skipped', reasonCode: 'OPTED_OUT' });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });
});

describe('RetentionV2MessageDispatchService — ventana horaria', () => {
  it('no manda si el momento del dispatch cayó fuera de la ventana permitida, pero NO se descarta — queda pendiente', async () => {
    const deps = makeDeps();
    deps.settings.isWithinSendingWindow.mockReturnValue(false);
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toMatchObject({
      status: 'deferred',
      reasonCode: 'OUTSIDE_SENDING_WINDOW',
    });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
    // Nunca terminal: el Message no se toca, sigue `queued` para el
    // próximo intento.
    expect(deps.prisma.message.update).not.toHaveBeenCalled();
    expect(deps.settings.isWithinSendingWindow).toHaveBeenCalledWith(
      DEFAULT_SETTINGS,
      'America/Montevideo',
      NOW,
    );
  });

  it('sigue mandando cuando el dispatch cae dentro de la ventana', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result.status).toBe('sent');
  });

  it('cuando la ventana vuelve a estar abierta, un reintento posterior manda de verdad — no se pierde', async () => {
    const deps = makeDeps();
    deps.settings.isWithinSendingWindow.mockReturnValueOnce(false);
    const service = makeService(deps);

    const outsideWindow = await service.dispatch('msg-1', NOW);
    expect(outsideWindow.status).toBe('deferred');

    // El mock vuelve a su default (true) para el segundo intento — mismo
    // Message, sigue `queued`, así que dispatch() lo revalida desde cero.
    const laterInsideWindow = await service.dispatch('msg-1', NOW);
    expect(laterInsideWindow.status).toBe('sent');
  });
});

describe('RetentionV2MessageDispatchService — cooldown global con prioridad determinística', () => {
  it('no manda si otra automatización ya contactó al cliente en las últimas 24h (bloqueado)', async () => {
    const deps = makeDeps();
    deps.cooldown.reserve.mockResolvedValue('blocked');
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'RECENT_CONTACT',
    });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('no manda si algo de mayor prioridad ya le robó el turno (outranked)', async () => {
    const deps = makeDeps();
    deps.cooldown.reserve.mockResolvedValue('outranked');
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'RECENT_CONTACT',
    });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('reserva el turno con el kind correcto para reactivación', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);

    expect(deps.cooldown.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'reactivation',
      }),
    );
  });

  it('reserva el turno con el kind correcto para "casi llegás"', async () => {
    const deps = makeDeps(
      messageFixture({
        retentionAssignment: {
          id: 'assign-1',
          experiment: { objective: RetentionObjective.REWARD_GOAL_PROGRESS },
        },
      }),
    );
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);

    expect(deps.cooldown.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'progress_reminder' }),
    );
  });

  it('si todavía no pasó el período de gracia, NO manda — queda pendiente (no terminal)', async () => {
    const deps = makeDeps();
    deps.cooldown.confirm.mockResolvedValue('not_ready');
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toMatchObject({
      status: 'deferred',
      reasonCode: 'AWAITING_PRIORITY_WINDOW',
    });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
    expect(deps.prisma.message.update).not.toHaveBeenCalled();
  });

  it('si algo de mayor prioridad confirma primero mientras se esperaba, el reintento pierde', async () => {
    const deps = makeDeps();
    deps.cooldown.confirm.mockResolvedValueOnce('not_ready');
    const service = makeService(deps);

    const deferred = await service.dispatch('msg-1', NOW);
    expect(deferred.status).toBe('deferred');

    // Durante la espera, otra automatización de mayor prioridad se quedó
    // con el turno — el reintento lo nota vía `confirm()`.
    deps.cooldown.confirm.mockResolvedValueOnce('outranked');
    const retried = await service.dispatch('msg-1', NOW);

    expect(retried).toEqual({
      status: 'skipped',
      reasonCode: 'RECENT_CONTACT',
    });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('sin ninguna automatización de mayor prioridad activa, confirma sin esperar el período de gracia', async () => {
    // DEFAULT_SETTINGS no trae birthdayEmailEnabled/stampsExpiryEmailEnabled
    // (mismo default que el schema: false) — nada le puede ganar el turno a
    // esto hoy, así que esperar no protege de nada real.
    const deps = makeDeps();
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);

    expect(deps.cooldown.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ skipGraceIfUncontested: true }),
    );
  });

  it('con Cumpleaños activo para el negocio, sí exige el período de gracia', async () => {
    const deps = makeDeps();
    deps.settings.getOrCreate.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      birthdayEmailEnabled: true,
    });
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);

    expect(deps.cooldown.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ skipGraceIfUncontested: false }),
    );
  });

  it('con Sellos por vencer activo (rewardGoals + toggle) para el negocio, sí exige el período de gracia', async () => {
    const deps = makeDeps();
    deps.settings.getOrCreate.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      rewardGoalsEnabled: true,
      stampsExpiryEmailEnabled: true,
    });
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);

    expect(deps.cooldown.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ skipGraceIfUncontested: false }),
    );
  });

  it('el toggle de sellos por vencer sin rewardGoals encendido no cuenta como amenaza real', async () => {
    // stampsExpiryEmailEnabled solo aplica si además hay tarjeta de sellos
    // activa (rewardGoalsEnabled) — StampsExpiryEmailService nunca manda
    // sin eso, así que no hace falta esperar por él.
    const deps = makeDeps();
    deps.settings.getOrCreate.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      rewardGoalsEnabled: false,
      stampsExpiryEmailEnabled: true,
    });
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);

    expect(deps.cooldown.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ skipGraceIfUncontested: true }),
    );
  });

  it('un cooldown bloqueado también impide el email side-channel — un solo reclamo cubre los dos canales', async () => {
    const deps = makeDeps(
      messageFixture({
        customer: {
          id: 'cust-1',
          name: 'Cliente Test',
          email: 'cliente@test.com',
          optedOut: false,
          phoneE164: '+59891111111',
        },
      }),
    );
    deps.plans.hasProAccess.mockResolvedValue(true);
    deps.cooldown.reserve.mockResolvedValue('blocked');
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);
    await new Promise((resolve) => setImmediate(resolve));

    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
  });
});

describe('RetentionV2MessageDispatchService — channel', () => {
  it('skips when the customer has no phone on file', async () => {
    const deps = makeDeps(
      messageFixture({
        customer: { id: 'cust-1', optedOut: false, phoneE164: null },
      }),
    );
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'NO_CONTACT_CHANNEL',
    });
  });

  it('skips — without crashing — when the WhatsApp provider is not configured at all', async () => {
    const deps = makeDeps();
    deps.whatsApp.isChannelAvailable.mockResolvedValue(false);
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'CHANNEL_NOT_CONFIGURED',
    });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });
});

describe('RetentionV2MessageDispatchService — quota', () => {
  it('does not send once the business has hit its monthly quota', async () => {
    const deps = makeDeps(
      messageFixture({
        business: {
          id: 'biz-1',
          timezone: 'America/Montevideo',
          retentionEngineV2Enabled: true,
          messageQuotaMonthly: 600,
          messageCountCurrentMonth: 600,
        },
      }),
    );
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'QUOTA_EXCEEDED',
    });
  });
});

describe('RetentionV2MessageDispatchService — missing body', () => {
  it('refuses to send a blank WhatsApp message', async () => {
    const deps = makeDeps(messageFixture({ body: null }));
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({
      status: 'skipped',
      reasonCode: 'MISSING_BODY',
    });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });
});

describe('RetentionV2MessageDispatchService — idempotency', () => {
  it('is a no-op for a message that is not queued (already sent/failed)', async () => {
    const deps = makeDeps(messageFixture({ status: MessageStatus.sent }));
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({ status: 'already_processed' });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('backs off instead of double-sending when a concurrent claim already won', async () => {
    // Both callers pass every gate (single read each) but only one wins the
    // atomic claim — this simulates the loser.
    const deps = makeDeps();
    deps.prisma.message.updateMany.mockResolvedValue({ count: 0 });
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({ status: 'already_processed' });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });
});

describe('RetentionV2MessageDispatchService — email side-channel (Pro)', () => {
  async function flush() {
    await new Promise((resolve) => setImmediate(resolve));
  }

  it('sends the email alongside WhatsApp for a Pro business with a customer email', async () => {
    const deps = makeDeps(
      messageFixture({
        customer: {
          id: 'cust-1',
          name: 'Cliente Test',
          email: 'cliente@test.com',
          optedOut: false,
          phoneE164: '+59891111111',
        },
      }),
    );
    deps.plans.hasProAccess.mockResolvedValue(true);
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);
    await flush();

    expect(result.status).toBe('sent');
    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'reactivation',
        dedupeKey: 'msg-1',
        to: 'cliente@test.com',
      }),
    );
  });

  it('never emails a Free business, even with a customer email on file', async () => {
    const deps = makeDeps(
      messageFixture({
        customer: {
          id: 'cust-1',
          name: 'Cliente Test',
          email: 'cliente@test.com',
          optedOut: false,
          phoneE164: '+59891111111',
        },
      }),
    );
    deps.plans.hasProAccess.mockResolvedValue(false);
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);
    await flush();

    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
  });

  it('never emails a customer with no email on file, even if the business is Pro', async () => {
    const deps = makeDeps(); // customer.email is null in the base fixture
    deps.plans.hasProAccess.mockResolvedValue(true);
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);
    await flush();

    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
  });

  it('still sends the WhatsApp message when the email side-channel fails', async () => {
    const deps = makeDeps(
      messageFixture({
        customer: {
          id: 'cust-1',
          name: 'Cliente Test',
          email: 'cliente@test.com',
          optedOut: false,
          phoneE164: '+59891111111',
        },
      }),
    );
    deps.plans.hasProAccess.mockRejectedValue(new Error('db down'));
    const service = makeService(deps);

    const result = await service.dispatch('msg-1', NOW);
    await flush();

    expect(result.status).toBe('sent');
    expect(deps.whatsApp.sendText).toHaveBeenCalled();
  });

  it('marks the progress-reminder kind for a REWARD_GOAL_PROGRESS message', async () => {
    const deps = makeDeps(
      messageFixture({
        customer: {
          id: 'cust-1',
          name: 'Cliente Test',
          email: 'cliente@test.com',
          optedOut: false,
          phoneE164: '+59891111111',
        },
        retentionAssignment: {
          id: 'assign-1',
          experiment: { objective: RetentionObjective.REWARD_GOAL_PROGRESS },
        },
      }),
    );
    deps.plans.hasProAccess.mockResolvedValue(true);
    const service = makeService(deps);

    await service.dispatch('msg-1', NOW);
    await flush();

    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'progress_reminder' }),
    );
  });
});

describe('RetentionV2MessageDispatchService — provider error / retry', () => {
  it('reverts the claim back to queued and re-throws on a provider failure', async () => {
    const deps = makeDeps();
    deps.whatsApp.sendText.mockRejectedValue(new Error('whapi 500'));
    const service = makeService(deps);

    await expect(service.dispatch('msg-1', NOW)).rejects.toThrow('whapi 500');

    expect(deps.prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { status: MessageStatus.queued },
    });
    expect(loggedCodes(deps)).toContain('MESSAGE_SEND_FAILED');
  });

  it('a later retry can succeed after the row was put back to queued', async () => {
    const deps = makeDeps();
    // First attempt: provider fails, service reverts the row to `queued`.
    deps.whatsApp.sendText.mockRejectedValueOnce(new Error('whapi 500'));
    const service = makeService(deps);
    await expect(service.dispatch('msg-1', NOW)).rejects.toThrow('whapi 500');

    // Second attempt (BullMQ retry): everything re-validates fresh and the
    // provider call succeeds this time.
    deps.whatsApp.sendText.mockResolvedValueOnce({ whatsappMessageId: 'wa-2' });
    const result = await service.dispatch('msg-1', NOW);

    expect(result).toEqual({ status: 'sent', whatsappMessageId: 'wa-2' });
  });

  it('markPermanentlyFailed moves a still-queued message to failed and logs it', async () => {
    const deps = makeDeps();
    deps.prisma.message.updateMany.mockResolvedValue({ count: 1 });
    deps.prisma.message.findUnique.mockResolvedValue({
      businessId: 'biz-1',
      customerId: 'cust-1',
      retentionAssignment: { id: 'assign-1' },
    });
    const service = makeService(deps);

    await service.markPermanentlyFailed('msg-1', new Error('exhausted'));

    expect(deps.prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: 'msg-1', status: MessageStatus.queued },
      data: { status: MessageStatus.failed },
    });
    expect(loggedCodes(deps)).toContain('MESSAGE_SEND_FAILED');
  });

  it('markPermanentlyFailed does nothing if the message already resolved another way', async () => {
    const deps = makeDeps();
    deps.prisma.message.updateMany.mockResolvedValue({ count: 0 });
    const service = makeService(deps);

    await service.markPermanentlyFailed('msg-1', new Error('exhausted'));

    expect(deps.decisions.record).not.toHaveBeenCalled();
  });
});
