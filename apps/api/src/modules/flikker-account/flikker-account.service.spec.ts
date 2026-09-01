import { FlikkerAccountService } from './flikker-account.service';

function makeDeps(
  options: {
    account?: unknown;
    raced?: boolean;
    welcomeLinkClaimCount?: number;
  } = {},
) {
  const prisma = {
    flikkerAccount: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.account === undefined ? null : options.account,
        ),
      create: jest.fn().mockResolvedValue({ id: 'account-new' }),
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: options.welcomeLinkClaimCount ?? 1 }),
    },
    customer: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  const verifications = {
    start: jest.fn().mockResolvedValue({ code: '123456', sent: true }),
    verify: jest.fn().mockResolvedValue(true),
  };
  const sessions = {
    issue: jest.fn().mockResolvedValue({
      rawToken: 'raw-token',
      expiresAt: new Date('2026-09-01'),
    }),
    resolveLive: jest.fn().mockResolvedValue(null),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const messaging = {
    sendVerificationCode: jest.fn().mockResolvedValue(undefined),
    sendMiFlikkerWelcome: jest.fn().mockResolvedValue(undefined),
  };
  return { prisma, verifications, sessions, messaging };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new FlikkerAccountService(
    deps.prisma as never,
    deps.verifications as never,
    deps.sessions as never,
    deps.messaging as never,
  );
}

describe('FlikkerAccountService.startVerification', () => {
  it('normalizes the phone and sends the code via WhatsApp', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.startVerification('099123456');

    expect(result).toEqual({ sent: true });
    expect(deps.verifications.start).toHaveBeenCalledWith('+59899123456');
    expect(deps.messaging.sendVerificationCode).toHaveBeenCalledWith(
      '+59899123456',
      'Flikker',
      '123456',
    );
  });

  it('rejects an invalid phone before touching anything else', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await expect(service.startVerification('abc')).rejects.toThrow();
    expect(deps.verifications.start).not.toHaveBeenCalled();
  });

  it('still responds sent:true when the code was throttled by cooldown', async () => {
    const deps = makeDeps();
    deps.verifications.start.mockResolvedValue({ code: null, sent: false });
    const service = makeService(deps);

    expect(await service.startVerification('099123456')).toEqual({
      sent: true,
    });
    expect(deps.messaging.sendVerificationCode).not.toHaveBeenCalled();
  });
});

describe('FlikkerAccountService.verifyAndIssueSession — the core safety rule', () => {
  it('rejects a wrong code and never creates an account or links anything', async () => {
    const deps = makeDeps();
    deps.verifications.verify.mockResolvedValue(false);
    const service = makeService(deps);

    await expect(
      service.verifyAndIssueSession('099123456', '000000'),
    ).rejects.toThrow('Código inválido');
    expect(deps.prisma.flikkerAccount.create).not.toHaveBeenCalled();
    expect(deps.prisma.customer.updateMany).not.toHaveBeenCalled();
    expect(deps.sessions.issue).not.toHaveBeenCalled();
  });

  it('creates the account on first-ever verification for this phone', async () => {
    const deps = makeDeps({ account: null });
    const service = makeService(deps);

    const result = await service.verifyAndIssueSession('099123456', '123456');

    expect(deps.prisma.flikkerAccount.create).toHaveBeenCalledWith({
      data: { phoneE164: '+59899123456' },
      select: { id: true },
    });
    expect(result.flikkerAccountId).toBe('account-new');
  });

  it('reuses the existing account instead of creating a duplicate', async () => {
    const deps = makeDeps({ account: { id: 'account-existing' } });
    const service = makeService(deps);

    const result = await service.verifyAndIssueSession('099123456', '123456');

    expect(deps.prisma.flikkerAccount.create).not.toHaveBeenCalled();
    expect(result.flikkerAccountId).toBe('account-existing');
  });

  it('links every unlinked Customer with the exact proven phone, across businesses', async () => {
    const deps = makeDeps({ account: { id: 'account-existing' } });
    const service = makeService(deps);

    await service.verifyAndIssueSession('099123456', '123456');

    expect(deps.prisma.customer.updateMany).toHaveBeenCalledWith({
      where: { phoneE164: '+59899123456', flikkerAccountId: null },
      data: { flikkerAccountId: 'account-existing' },
    });
  });

  it('issues a global session scoped to the account, not to any business', async () => {
    const deps = makeDeps({ account: { id: 'account-existing' } });
    const service = makeService(deps);

    const result = await service.verifyAndIssueSession(
      '099123456',
      '123456',
      'test-agent',
    );

    expect(deps.sessions.issue).toHaveBeenCalledWith(
      'account-existing',
      'test-agent',
    );
    expect(result.rawToken).toBe('raw-token');
  });

  it('recovers from a concurrent account creation race instead of failing', async () => {
    const deps = makeDeps({ account: null });
    deps.prisma.flikkerAccount.findUnique
      .mockResolvedValueOnce(null) // first check: nothing yet
      .mockResolvedValueOnce({ id: 'account-raced' }); // re-check after race
    deps.prisma.flikkerAccount.create.mockRejectedValue(
      new Error('unique violation'),
    );
    const service = makeService(deps);

    const result = await service.verifyAndIssueSession('099123456', '123456');

    expect(result.flikkerAccountId).toBe('account-raced');
  });
});

/**
 * Reemplaza a los tests de `sendWelcomeLinkOnce`, que ya no existe: ese
 * método mandaba un SEGUNDO WhatsApp (el que competía con el welcome del
 * check-in y volvía rechazado por rate limit). Ahora el link viaja dentro
 * del welcome y acá solo se reclama/libera el derecho a incluirlo.
 */
describe('FlikkerAccountService.claimWelcomeLink — una sola vez por cuenta/teléfono', () => {
  it('reclama el slot y devuelve el link cuando gana la carrera', async () => {
    const deps = makeDeps({ account: { id: 'account-existing' } });
    const service = makeService(deps);

    const link = await service.claimWelcomeLink('+59899123456');

    expect(deps.prisma.flikkerAccount.updateMany).toHaveBeenCalledWith({
      where: { id: 'account-existing', welcomeLinkSentAt: null },
      data: { welcomeLinkSentAt: expect.any(Date) },
    });
    expect(link).toContain('/mi');
  });

  it('devuelve null si ya se mandó antes (reclamo perdido, count: 0)', async () => {
    const deps = makeDeps({
      account: { id: 'account-existing' },
      welcomeLinkClaimCount: 0,
    });
    const service = makeService(deps);

    expect(await service.claimWelcomeLink('+59899123456')).toBeNull();
  });

  it('nunca tira hacia el caller, ni siquiera si la base falla', async () => {
    const deps = makeDeps({ account: { id: 'account-existing' } });
    deps.prisma.flikkerAccount.updateMany.mockRejectedValue(
      new Error('db down'),
    );
    const service = makeService(deps);

    await expect(service.claimWelcomeLink('+59899123456')).resolves.toBeNull();
  });

  it('releaseWelcomeLink devuelve el reclamo para que se pueda reintentar', async () => {
    const deps = makeDeps({ account: { id: 'account-existing' } });
    const service = makeService(deps);

    await service.releaseWelcomeLink('+59899123456');

    expect(deps.prisma.flikkerAccount.updateMany).toHaveBeenCalledWith({
      where: { phoneE164: '+59899123456' },
      data: { welcomeLinkSentAt: null },
    });
  });
});

describe('FlikkerAccountService.logout / resolveSession', () => {
  it('revokes the session token on logout', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.logout('some-token');

    expect(deps.sessions.revoke).toHaveBeenCalledWith('some-token');
  });

  it('does nothing when logging out without a token', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.logout(undefined);

    expect(deps.sessions.revoke).not.toHaveBeenCalled();
  });
});
