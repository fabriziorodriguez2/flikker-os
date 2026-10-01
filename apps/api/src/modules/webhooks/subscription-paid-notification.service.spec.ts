import { CheckoutPlan } from '@prisma/client';
import { SubscriptionPaidNotificationService } from './subscription-paid-notification.service';

/**
 * Parte 5, §12 — mockea Prisma/Email/WhatsApp/claim. Idempotencia real
 * (concurrencia de verdad) probada contra Postgres en
 * `mercado-pago-webhook.service.integration.spec.ts`; acá se prueba la
 * lógica de notificación en sí: qué se manda, a quién, y que el canal
 * owner nunca aparece sin contacto configurado.
 */
describe('SubscriptionPaidNotificationService', () => {
  const ORIGINAL_OWNER_PHONE = process.env.FLIKKER_OWNER_NOTIFICATION_PHONE;
  const ORIGINAL_OWNER_EMAIL = process.env.FLIKKER_OWNER_NOTIFICATION_EMAIL;

  beforeEach(() => {
    process.env.FLIKKER_OWNER_NOTIFICATION_PHONE = '+59891234567';
    delete process.env.FLIKKER_OWNER_NOTIFICATION_EMAIL;
  });

  afterEach(() => {
    process.env.FLIKKER_OWNER_NOTIFICATION_PHONE = ORIGINAL_OWNER_PHONE;
    process.env.FLIKKER_OWNER_NOTIFICATION_EMAIL = ORIGINAL_OWNER_EMAIL;
  });

  const LEAD = {
    plan: CheckoutPlan.MONTHLY,
    businessId: 'biz-1',
    requestedByUserId: 'user-1',
  };
  const USER = {
    firstName: 'Juan',
    lastName: 'Pérez',
    email: 'juan@ejemplo.com',
    notificationWhatsapp: '+59899123456',
  };
  const BUSINESS = { name: 'Café Ejemplo', phone: '+59898765432' };

  function makeDeps(opts: { claimed?: boolean } = {}) {
    const prisma = {
      checkoutLead: { findUnique: jest.fn().mockResolvedValue(LEAD) },
      user: { findUnique: jest.fn().mockResolvedValue(USER) },
      business: { findUnique: jest.fn().mockResolvedValue(BUSINESS) },
    };
    const claims = {
      claimOnce: jest.fn().mockResolvedValue(opts.claimed ?? true),
    };
    const email = {
      isAvailable: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue(undefined),
    };
    const whatsApp = { sendText: jest.fn().mockResolvedValue(undefined) };
    return { prisma, claims, email, whatsApp };
  }

  function makeService(deps: ReturnType<typeof makeDeps>) {
    return new SubscriptionPaidNotificationService(
      deps.prisma as never,
      deps.claims as never,
      deps.email as never,
      deps.whatsApp as never,
    );
  }

  it('primera vez: manda email + WhatsApp al cliente y WhatsApp al owner', async () => {
    const deps = makeDeps({ claimed: true });
    const service = makeService(deps);

    await service.fire('lead-1');

    expect(deps.claims.claimOnce).toHaveBeenCalledWith(
      'SUBSCRIPTION_PAID',
      'lead-1',
    );
    expect(deps.email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: USER.email }),
    );
    expect(deps.whatsApp.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ phone: USER.notificationWhatsapp }),
    );
    expect(deps.whatsApp.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+59891234567' }),
    );
  });

  it('la notificación al owner incluye nombre, negocio, email, teléfono, plan, importe, businessId y checkoutLeadId — nunca secretos', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.fire('lead-1');

    const ownerCall = deps.whatsApp.sendText.mock.calls.find(
      (call) => call[0].phone === '+59891234567',
    );
    expect(ownerCall).toBeDefined();
    const text = ownerCall![0].text as string;
    expect(text).toContain('Juan Pérez');
    expect(text).toContain('Café Ejemplo');
    expect(text).toContain(USER.email);
    expect(text).toContain('MONTHLY');
    expect(text).toContain('UYU');
    expect(text).toContain('1000');
    expect(text).toContain('biz-1');
    expect(text).toContain('lead-1');
    expect(text.toLowerCase()).not.toContain('token');
    expect(text.toLowerCase()).not.toContain('tarjeta');
  });

  it('ya reclamado: no lee lead/user/business ni manda nada', async () => {
    const deps = makeDeps({ claimed: false });
    const service = makeService(deps);

    await service.fire('lead-1');

    expect(deps.prisma.checkoutLead.findUnique).not.toHaveBeenCalled();
    expect(deps.email.send).not.toHaveBeenCalled();
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('llamado dos veces para el mismo lead: el segundo claim pierde, nada se duplica', async () => {
    const deps = makeDeps();
    deps.claims.claimOnce
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const service = makeService(deps);

    await service.fire('lead-1');
    await service.fire('lead-1');

    expect(deps.email.send).toHaveBeenCalledTimes(1);
  });

  it('lead sin businessId/requestedByUserId (flujo público viejo): no manda nada', async () => {
    const deps = makeDeps();
    deps.prisma.checkoutLead.findUnique.mockResolvedValue({
      plan: CheckoutPlan.MONTHLY,
      businessId: null,
      requestedByUserId: null,
    });
    const service = makeService(deps);

    await service.fire('lead-1');

    expect(deps.email.send).not.toHaveBeenCalled();
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('sin ningún contacto owner configurado: omite esa notificación, el cliente igual recibe la suya', async () => {
    delete process.env.FLIKKER_OWNER_NOTIFICATION_PHONE;
    const deps = makeDeps();
    const service = makeService(deps);

    await service.fire('lead-1');

    expect(deps.whatsApp.sendText).toHaveBeenCalledTimes(1); // solo el cliente
    expect(deps.email.send).toHaveBeenCalled();
  });
});
