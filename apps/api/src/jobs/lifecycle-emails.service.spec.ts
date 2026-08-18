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
  return { prisma, email };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new LifecycleEmailsService(deps.prisma as never, deps.email as never);
}

function duplicateKeyError() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

const BASE_INPUT = {
  businessId: 'biz-1',
  customerId: 'cust-1',
  kind: 'birthday' as const,
  dedupeKey: '2026',
  to: 'cliente@test.com',
  subject: 'Feliz cumpleaños',
  html: '<p>Hola</p>',
};

describe('LifecycleEmailsService — no email on file', () => {
  it('never reserves the dedupe slot when there is no recipient', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const outcome = await service.sendOnce({ ...BASE_INPUT, to: null });

    expect(outcome).toBe('skipped_no_email');
    expect(deps.prisma.emailLog.create).not.toHaveBeenCalled();
    expect(deps.email.send).not.toHaveBeenCalled();
  });
});

describe('LifecycleEmailsService — idempotency', () => {
  it('sends once and records the log with sentAt', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const outcome = await service.sendOnce(BASE_INPUT);

    expect(outcome).toBe('sent');
    expect(deps.prisma.emailLog.create).toHaveBeenCalledWith({
      data: {
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'birthday',
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
    expect(deps.prisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { sentAt: expect.any(Date) },
    });
  });

  it('a second call with the same (businessId, kind, dedupeKey) is a no-op, never calls the provider twice', async () => {
    const deps = makeDeps();
    deps.prisma.emailLog.create.mockRejectedValue(duplicateKeyError());
    const service = makeService(deps);

    const outcome = await service.sendOnce(BASE_INPUT);

    expect(outcome).toBe('skipped_duplicate');
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('re-throws a non-P2002 error from the log insert', async () => {
    const deps = makeDeps();
    deps.prisma.emailLog.create.mockRejectedValue(new Error('db down'));
    const service = makeService(deps);

    await expect(service.sendOnce(BASE_INPUT)).rejects.toThrow('db down');
  });
});

describe('LifecycleEmailsService — provider unavailable', () => {
  it('marks the log failed and returns skipped_unavailable without touching the provider', async () => {
    const deps = makeDeps();
    deps.email.isAvailable.mockReturnValue(false);
    const service = makeService(deps);

    const outcome = await service.sendOnce(BASE_INPUT);

    expect(outcome).toBe('skipped_unavailable');
    expect(deps.email.send).not.toHaveBeenCalled();
    expect(deps.prisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { status: 'failed', errorMessage: 'EMAIL_NOT_CONFIGURED' },
    });
  });
});

describe('LifecycleEmailsService — provider failure', () => {
  it('marks the log failed and returns failed when the provider throws', async () => {
    const deps = makeDeps();
    deps.email.send.mockRejectedValue(new Error('Resend 500'));
    const service = makeService(deps);

    const outcome = await service.sendOnce(BASE_INPUT);

    expect(outcome).toBe('failed');
    expect(deps.prisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { status: 'failed', errorMessage: 'Resend 500' },
    });
  });
});
