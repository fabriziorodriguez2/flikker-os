import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { VisitAttributionType } from '@prisma/client';
import { CheckinService } from './checkin.service';

function makeDeps() {
  const prisma = {
    customer: { findFirst: jest.fn(), create: jest.fn() },
    business: { findFirst: jest.fn() },
    googleReview: { findFirst: jest.fn().mockResolvedValue(null) },
    customerEvent: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const sources = { findByToken: jest.fn(), bumpScan: jest.fn() };
  const visits = {
    registerVisit: jest.fn(),
    countByCustomer: jest.fn().mockResolvedValue(1),
    findLastByCustomer: jest
      .fn()
      .mockResolvedValue({ occurredAt: new Date('2026-08-01T18:00:00Z') }),
  };
  const sessions = {
    issue: jest.fn(),
    resolveLive: jest.fn(),
    revoke: jest.fn(),
  };
  const verifications = { start: jest.fn(), verify: jest.fn() };
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  const benefits = {
    resolveActiveBenefit: jest.fn().mockResolvedValue(null),
    registerParticipation: jest.fn().mockResolvedValue(undefined),
  };
  const messaging = {
    sendWelcome: jest.fn(),
    sendOwnerNotification: jest.fn(),
    enqueueReviewRequest: jest.fn(),
    sendVerificationCode: jest.fn(),
  };
  return {
    prisma,
    sources,
    visits,
    sessions,
    verifications,
    events,
    benefits,
    messaging,
  };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new CheckinService(
    deps.prisma as never,
    deps.sources as never,
    deps.visits as never,
    deps.sessions as never,
    deps.verifications as never,
    deps.events as never,
    deps.benefits as never,
    deps.messaging as never,
  );
}

const activeSource = {
  id: 'src-1',
  name: 'Principal',
  type: 'qr',
  isActive: true,
  businessId: 'biz-1',
  business: { id: 'biz-1', isActive: true, experienceVersion: 'CHECKIN_V2' },
};

const fullBusiness = {
  id: 'biz-1',
  name: 'Café Uno',
  logoUrl: null,
  primaryColor: null,
  googleBusinessProfileUrl: 'https://g.page/cafe',
  phone: '+59899000000',
  timezone: 'America/Montevideo',
  checkinMinHoursBetweenVisits: 8,
  checkinMaxVisitsPerDay: 1,
  checkinReviewPromptEveryDays: 30,
  experienceVersion: 'CHECKIN_V2',
};

describe('CheckinService', () => {
  it('register: an existing phone does NOT create a session — routes to verification', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    deps.prisma.customer.findFirst.mockResolvedValue({ id: 'existing' });
    const service = makeService(deps);

    const result = await service.register(
      'tok',
      { name: 'Ana', phone: '099111222' },
      'ua',
    );

    expect(result).toEqual({ status: 'exists', requiresVerification: true });
    expect(deps.prisma.customer.create).not.toHaveBeenCalled();
    expect(deps.sessions.issue).not.toHaveBeenCalled();
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
  });

  it('register: a new phone creates the customer, first visit, and a session', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    // 1st findFirst (new-phone check) → null; later (buildPersonalSpace) → customer
    deps.prisma.customer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'cust-1', name: 'Ana' });
    deps.prisma.customer.create.mockResolvedValue({
      id: 'cust-1',
      name: 'Ana',
    });
    deps.visits.registerVisit.mockResolvedValue({
      created: true,
      isReturn: false,
      visit: { id: 'v-1', attributionType: VisitAttributionType.organic },
    });
    deps.sessions.issue.mockResolvedValue({
      rawToken: 'raw-token',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    const service = makeService(deps);

    const result = await service.register(
      'tok',
      { name: 'Ana', phone: '099111222' },
      'ua',
    );

    expect(deps.prisma.customer.create).toHaveBeenCalledTimes(1);
    expect(deps.visits.registerVisit).toHaveBeenCalledTimes(1);
    // First visit must not run campaign attribution.
    expect(deps.visits.registerVisit.mock.calls[0][0]).toMatchObject({
      attribute: false,
    });
    expect(deps.messaging.enqueueReviewRequest).toHaveBeenCalledWith(
      'biz-1',
      'cust-1',
      null,
    );
    expect(result).toMatchObject({
      status: 'registered',
      sessionToken: 'raw-token',
    });
    if (result.status !== 'registered') throw new Error('expected registered');
    expect(result.personal.reviewPrompt.show).toBe(true);
  });

  it('checkin: without a valid session throws Unauthorized (web shows the form)', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    deps.sessions.resolveLive.mockResolvedValue(null);
    const service = makeService(deps);

    await expect(service.checkin('tok', undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
  });

  it('recoverStart: unknown phone still responds sent:true but sends no code', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    deps.prisma.customer.findFirst.mockResolvedValue(null);
    const service = makeService(deps);

    const result = await service.recoverStart('tok', '099111222');

    expect(result).toEqual({ sent: true });
    expect(deps.verifications.start).not.toHaveBeenCalled();
    expect(deps.messaging.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('recoverVerify: a wrong code throws Unauthorized and issues no session', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    deps.prisma.customer.findFirst.mockResolvedValue({
      id: 'cust-1',
      name: 'Ana',
    });
    deps.verifications.verify.mockResolvedValue(false);
    const service = makeService(deps);

    await expect(
      service.recoverVerify('tok', '099111222', '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(deps.sessions.issue).not.toHaveBeenCalled();
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
  });

  it('emitClientEvent: rejects an event type outside the whitelist', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await expect(
      service.emitClientEvent('tok', 'visit_created', 'sess'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
