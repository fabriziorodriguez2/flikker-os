import { RegistrationCompletedService } from './registration-completed.service';

/**
 * Parte 5, §11 — mockea Prisma/Email/WhatsApp/claim. Lo que importa acá:
 * `fire()` llamado dos veces para el MISMO businessId dispara los envíos
 * UNA sola vez — la concurrencia real (dos `fire()` simultáneos) la
 * garantiza `DomainEventClaimService` contra Postgres real, probado por
 * separado.
 */
describe('RegistrationCompletedService', () => {
  const ORIGINAL_OWNER_PHONE = process.env.FLIKKER_OWNER_NOTIFICATION_PHONE;

  beforeEach(() => {
    process.env.FLIKKER_OWNER_NOTIFICATION_PHONE = '+59891234567';
  });

  afterEach(() => {
    process.env.FLIKKER_OWNER_NOTIFICATION_PHONE = ORIGINAL_OWNER_PHONE;
  });

  const USER = {
    firstName: 'Juan',
    lastName: 'Pérez',
    email: 'juan@ejemplo.com',
    notificationWhatsapp: '+59899123456',
  };
  const BUSINESS = { name: 'Café Ejemplo' };

  function makeDeps(opts: { claimed?: boolean } = {}) {
    const prisma = {
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
    return new RegistrationCompletedService(
      deps.prisma as never,
      deps.claims as never,
      deps.email as never,
      deps.whatsApp as never,
    );
  }

  it('primera vez (claim ganado): manda email, WhatsApp y notificación al owner', async () => {
    const deps = makeDeps({ claimed: true });
    const service = makeService(deps);

    await service.fire('biz-1', 'user-1');

    expect(deps.claims.claimOnce).toHaveBeenCalledWith(
      'REGISTRATION_COMPLETED',
      'biz-1',
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

  it('sin FLIKKER_OWNER_NOTIFICATION_PHONE configurado: omite la notificación interna, el resto sigue andando', async () => {
    delete process.env.FLIKKER_OWNER_NOTIFICATION_PHONE;
    const deps = makeDeps({ claimed: true });
    const service = makeService(deps);

    await service.fire('biz-1', 'user-1');

    expect(deps.email.send).toHaveBeenCalled();
    expect(deps.whatsApp.sendText).toHaveBeenCalledTimes(1); // solo la bienvenida al usuario
  });

  it('ya reclamado (claim perdido): no lee User/Business ni manda nada', async () => {
    const deps = makeDeps({ claimed: false });
    const service = makeService(deps);

    await service.fire('biz-1', 'user-1');

    expect(deps.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(deps.email.send).not.toHaveBeenCalled();
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('llamado dos veces para el mismo business: el segundo claim pierde, el email nunca se duplica', async () => {
    const deps = makeDeps();
    deps.claims.claimOnce
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const service = makeService(deps);

    await service.fire('biz-1', 'user-1');
    await service.fire('biz-1', 'user-1');

    expect(deps.email.send).toHaveBeenCalledTimes(1);
    // Uno al usuario + uno al owner — pero solo en la PRIMERA llamada.
    expect(deps.whatsApp.sendText).toHaveBeenCalledTimes(2);
  });

  it('usuario sin WhatsApp de notificación: omite ESE canal (el email y el aviso al owner siguen andando)', async () => {
    const deps = makeDeps();
    deps.prisma.user.findUnique.mockResolvedValue({
      ...USER,
      notificationWhatsapp: null,
    });
    const service = makeService(deps);

    await service.fire('biz-1', 'user-1');

    expect(deps.email.send).toHaveBeenCalled();
    expect(deps.whatsApp.sendText).not.toHaveBeenCalledWith(
      expect.objectContaining({ phone: USER.notificationWhatsapp }),
    );
    expect(deps.whatsApp.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+59891234567' }),
    );
  });

  it('un canal que falla no bloquea a los demás', async () => {
    const deps = makeDeps();
    deps.email.send.mockRejectedValue(new Error('Resend caído'));
    const service = makeService(deps);

    await service.fire('biz-1', 'user-1');

    expect(deps.whatsApp.sendText).toHaveBeenCalled();
  });
});
