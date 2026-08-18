import { Prisma } from '@prisma/client';
import { LifecycleEmailsService } from './lifecycle-emails.service';

function makeDeps() {
  const prisma = {
    emailLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const email = {
    isAvailable: jest.fn().mockReturnValue(true),
    send: jest.fn().mockResolvedValue(null),
  };
  const whatsApp = {
    isChannelAvailable: jest.fn().mockResolvedValue(true),
    sendText: jest.fn().mockResolvedValue({ whatsappMessageId: 'wa-1' }),
  };
  return { prisma, email, whatsApp };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new LifecycleEmailsService(
    deps.prisma as never,
    deps.email as never,
    deps.whatsApp as never,
  );
}

function duplicateKeyError() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

const EMAIL_INPUT = {
  businessId: 'biz-1',
  customerId: 'cust-1',
  kind: 'birthday' as const,
  channel: 'email' as const,
  dedupeKey: '2026',
  to: 'cliente@test.com',
  subject: 'Feliz cumpleaños',
  html: '<p>Hola</p>',
};

const WHATSAPP_INPUT = {
  businessId: 'biz-1',
  customerId: 'cust-1',
  kind: 'birthday' as const,
  channel: 'whatsapp' as const,
  dedupeKey: '2026',
  to: '+59891111111',
  text: 'Feliz cumpleaños',
};

describe('LifecycleEmailsService — no recipient on file', () => {
  it('never reserves the dedupe slot when there is no email', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const outcome = await service.sendOnce({ ...EMAIL_INPUT, to: null });

    expect(outcome).toBe('skipped_no_email');
    expect(deps.prisma.emailLog.create).not.toHaveBeenCalled();
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('never reserves the dedupe slot when there is no phone', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const outcome = await service.sendOnce({ ...WHATSAPP_INPUT, to: null });

    expect(outcome).toBe('skipped_no_email');
    expect(deps.prisma.emailLog.create).not.toHaveBeenCalled();
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
  });
});

describe('LifecycleEmailsService — email channel', () => {
  it('sends once and records the log with sentAt', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const outcome = await service.sendOnce(EMAIL_INPUT);

    expect(outcome).toBe('sent');
    expect(deps.prisma.emailLog.create).toHaveBeenCalledWith({
      data: {
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'birthday',
        channel: 'email',
        dedupeKey: '2026',
        status: 'sent',
      },
      select: { id: true },
    });
    expect(deps.email.send).toHaveBeenCalledWith({
      to: 'cliente@test.com',
      subject: 'Feliz cumpleaños',
      html: '<p>Hola</p>',
    });
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
    expect(deps.prisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { sentAt: expect.any(Date) },
    });
  });

  it('a second call with the same (businessId, kind, channel, dedupeKey) is a no-op, never calls the provider twice', async () => {
    const deps = makeDeps();
    deps.prisma.emailLog.create.mockRejectedValue(duplicateKeyError());
    const service = makeService(deps);

    const outcome = await service.sendOnce(EMAIL_INPUT);

    expect(outcome).toBe('skipped_duplicate');
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('re-throws a non-P2002 error from the log insert', async () => {
    const deps = makeDeps();
    deps.prisma.emailLog.create.mockRejectedValue(new Error('db down'));
    const service = makeService(deps);

    await expect(service.sendOnce(EMAIL_INPUT)).rejects.toThrow('db down');
  });

  it('marks the log failed and returns skipped_unavailable without touching the provider', async () => {
    const deps = makeDeps();
    deps.email.isAvailable.mockReturnValue(false);
    const service = makeService(deps);

    const outcome = await service.sendOnce(EMAIL_INPUT);

    expect(outcome).toBe('skipped_unavailable');
    expect(deps.email.send).not.toHaveBeenCalled();
    expect(deps.prisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { status: 'failed', errorMessage: 'EMAIL_NOT_CONFIGURED' },
    });
  });

  it('marks the log failed and returns failed when the provider throws', async () => {
    const deps = makeDeps();
    deps.email.send.mockRejectedValue(new Error('Resend 500'));
    const service = makeService(deps);

    const outcome = await service.sendOnce(EMAIL_INPUT);

    expect(outcome).toBe('failed');
    expect(deps.prisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { status: 'failed', errorMessage: 'Resend 500' },
    });
  });
});

describe('LifecycleEmailsService — whatsapp channel', () => {
  it('sends once via WhatsAppBspService and records the log with sentAt', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const outcome = await service.sendOnce(WHATSAPP_INPUT);

    expect(outcome).toBe('sent');
    expect(deps.prisma.emailLog.create).toHaveBeenCalledWith({
      data: {
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'birthday',
        channel: 'whatsapp',
        dedupeKey: '2026',
        status: 'sent',
      },
      select: { id: true },
    });
    expect(deps.whatsApp.sendText).toHaveBeenCalledWith({
      phone: '+59891111111',
      text: 'Feliz cumpleaños',
    });
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('the same dedupeKey for the email channel does not block the whatsapp channel', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const emailOutcome = await service.sendOnce(EMAIL_INPUT);
    const whatsAppOutcome = await service.sendOnce(WHATSAPP_INPUT);

    expect(emailOutcome).toBe('sent');
    expect(whatsAppOutcome).toBe('sent');
  });

  it('marks the log failed and returns skipped_unavailable when the WhatsApp channel is not configured', async () => {
    const deps = makeDeps();
    deps.whatsApp.isChannelAvailable.mockResolvedValue(false);
    const service = makeService(deps);

    const outcome = await service.sendOnce(WHATSAPP_INPUT);

    expect(outcome).toBe('skipped_unavailable');
    expect(deps.whatsApp.sendText).not.toHaveBeenCalled();
    expect(deps.prisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { status: 'failed', errorMessage: 'WHATSAPP_NOT_CONFIGURED' },
    });
  });

  it('marks the log failed and returns failed when the provider throws', async () => {
    const deps = makeDeps();
    deps.whatsApp.sendText.mockRejectedValue(new Error('provider 500'));
    const service = makeService(deps);

    const outcome = await service.sendOnce(WHATSAPP_INPUT);

    expect(outcome).toBe('failed');
    expect(deps.prisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { status: 'failed', errorMessage: 'provider 500' },
    });
  });
});
