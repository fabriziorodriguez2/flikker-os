import { Prisma } from '@prisma/client';
import { OwnerLifecycleEmailLogService } from './owner-lifecycle-email-log.service';

function duplicateError() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function makeDeps(
  options: {
    createImpl?: () => Promise<{ id: string }>;
    emailAvailable?: boolean;
    sendImpl?: () => Promise<unknown>;
    whatsAppAvailable?: boolean;
    whatsAppSendImpl?: () => Promise<unknown>;
  } = {},
) {
  const prisma = {
    ownerLifecycleEmailLog: {
      create: jest
        .fn()
        .mockImplementation(
          options.createImpl ?? (() => Promise.resolve({ id: 'log-1' })),
        ),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const email = {
    isAvailable: jest.fn().mockReturnValue(options.emailAvailable ?? true),
    send: jest
      .fn()
      .mockImplementation(options.sendImpl ?? (() => Promise.resolve({}))),
  };
  const whatsApp = {
    isChannelAvailable: jest
      .fn()
      .mockResolvedValue(options.whatsAppAvailable ?? true),
    sendText: jest
      .fn()
      .mockImplementation(
        options.whatsAppSendImpl ??
          (() => Promise.resolve({ whatsappMessageId: 'wa-1' })),
      ),
  };
  return { prisma, email, whatsApp };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new OwnerLifecycleEmailLogService(
    deps.prisma as never,
    deps.email as never,
    deps.whatsApp as never,
  );
}

describe('OwnerLifecycleEmailLogService.sendOnce', () => {
  it('nunca reserva el slot de idempotencia si no hay a quién mandarle', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const outcome = await service.sendOnce({
      businessId: 'biz-1',
      kind: 'first_week',
      dedupeKey: 'once',
      to: [],
      subject: 'x',
      html: '<p>x</p>',
    });

    expect(outcome).toBe('skipped_no_recipient');
    expect(deps.prisma.ownerLifecycleEmailLog.create).not.toHaveBeenCalled();
  });

  it('un segundo intento con el mismo (businessId, kind, dedupeKey) nunca duplica el envío', async () => {
    const deps = makeDeps({
      createImpl: () => Promise.reject(duplicateError()),
    });
    const service = makeService(deps);

    const outcome = await service.sendOnce({
      businessId: 'biz-1',
      kind: 'weekly_summary_v2',
      dedupeKey: '2026-08-17',
      to: ['owner@negocio.com'],
      subject: 'x',
      html: '<p>x</p>',
    });

    expect(outcome).toBe('skipped_duplicate');
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('manda el email y marca la fila como enviada cuando todo sale bien', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const outcome = await service.sendOnce({
      businessId: 'biz-1',
      kind: 'first_month',
      dedupeKey: 'once',
      to: ['owner@negocio.com', 'admin@negocio.com'],
      subject: 'Tu primer mes',
      html: '<p>hola</p>',
    });

    expect(outcome).toBe('sent');
    expect(deps.email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['owner@negocio.com', 'admin@negocio.com'],
      }),
    );
    expect(deps.prisma.ownerLifecycleEmailLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sentAt: expect.any(Date) }),
      }),
    );
  });

  it('si el proveedor de email no está configurado, la fila queda failed y no se reintenta el mismo slot', async () => {
    const deps = makeDeps({ emailAvailable: false });
    const service = makeService(deps);

    const outcome = await service.sendOnce({
      businessId: 'biz-1',
      kind: 'monthly_summary',
      dedupeKey: '2026-08',
      to: ['owner@negocio.com'],
      subject: 'x',
      html: '<p>x</p>',
    });

    expect(outcome).toBe('skipped_unavailable');
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('un fallo real de envío se registra como failed, sin tirar la excepción hacia el caller', async () => {
    const deps = makeDeps({
      sendImpl: () => Promise.reject(new Error('boom')),
    });
    const service = makeService(deps);

    const outcome = await service.sendOnce({
      businessId: 'biz-1',
      kind: 'trial_ending_5d',
      dedupeKey: 'once',
      to: ['owner@negocio.com'],
      subject: 'x',
      html: '<p>x</p>',
    });

    expect(outcome).toBe('failed');
  });
});

describe('OwnerLifecycleEmailLogService.sendOnceWhatsApp', () => {
  it('nunca reserva el slot si no hay a quién mandarle', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const outcome = await service.sendOnceWhatsApp({
      businessId: 'biz-1',
      kind: 'milestone_whatsapp',
      dedupeKey: 'customers_50',
      to: [],
      text: 'x',
    });

    expect(outcome).toBe('skipped_no_recipient');
    expect(deps.prisma.ownerLifecycleEmailLog.create).not.toHaveBeenCalled();
  });

  it('un segundo intento con el mismo (businessId, kind, dedupeKey) nunca duplica el envío', async () => {
    const deps = makeDeps({
      createImpl: () => Promise.reject(duplicateError()),
    });
    const service = makeService(deps);

    const outcome = await service.sendOnceWhatsApp({
      businessId: 'biz-1',
      kind: 'milestone_whatsapp',
      dedupeKey: 'customers_50',
      to: ['+59899123456'],
      text: 'x',
    });

    expect(outcome).toBe('skipped_duplicate');
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('manda a CADA teléfono por separado (WhatsApp no soporta multi-destinatario)', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const outcome = await service.sendOnceWhatsApp({
      businessId: 'biz-1',
      kind: 'milestone_whatsapp',
      dedupeKey: 'customers_50',
      to: ['+59899111111', '+59899222222'],
      text: 'Llegaste a 50 clientes 🙌',
    });

    expect(outcome).toBe('sent');
    expect(deps.whatsApp.sendText).toHaveBeenCalledTimes(2);
    expect(deps.whatsApp.sendText).toHaveBeenCalledWith({
      phone: '+59899111111',
      text: 'Llegaste a 50 clientes 🙌',
    });
    expect(deps.whatsApp.sendText).toHaveBeenCalledWith({
      phone: '+59899222222',
      text: 'Llegaste a 50 clientes 🙌',
    });
  });

  it('un teléfono roto no aborta a los demás — "sent" si al menos uno recibió', async () => {
    const deps = makeDeps();
    deps.whatsApp.sendText
      .mockRejectedValueOnce(new Error('invalid number'))
      .mockResolvedValueOnce({ whatsappMessageId: 'wa-2' });
    const service = makeService(deps);

    const outcome = await service.sendOnceWhatsApp({
      businessId: 'biz-1',
      kind: 'milestone_whatsapp',
      dedupeKey: 'customers_50',
      to: ['+59899111111', '+59899222222'],
      text: 'x',
    });

    expect(outcome).toBe('sent');
  });

  it('si el canal de WhatsApp no está disponible, queda failed sin reintentar el mismo slot', async () => {
    const deps = makeDeps({ whatsAppAvailable: false });
    const service = makeService(deps);

    const outcome = await service.sendOnceWhatsApp({
      businessId: 'biz-1',
      kind: 'milestone_whatsapp',
      dedupeKey: 'customers_50',
      to: ['+59899111111'],
      text: 'x',
    });

    expect(outcome).toBe('skipped_unavailable');
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });

  it('si TODOS los envíos fallan, el resultado es failed', async () => {
    const deps = makeDeps({
      whatsAppSendImpl: () => Promise.reject(new Error('down')),
    });
    const service = makeService(deps);

    const outcome = await service.sendOnceWhatsApp({
      businessId: 'biz-1',
      kind: 'milestone_whatsapp',
      dedupeKey: 'customers_50',
      to: ['+59899111111'],
      text: 'x',
    });

    expect(outcome).toBe('failed');
  });
});

describe('OwnerLifecycleEmailLogService.alreadyLogged', () => {
  it('consulta por el índice único exacto (businessId, kind, dedupeKey)', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.alreadyLogged('biz-1', 'monthly_summary', '2026-08');

    expect(deps.prisma.ownerLifecycleEmailLog.findUnique).toHaveBeenCalledWith({
      where: {
        businessId_kind_dedupeKey: {
          businessId: 'biz-1',
          kind: 'monthly_summary',
          dedupeKey: '2026-08',
        },
      },
      select: { id: true },
    });
  });
});
