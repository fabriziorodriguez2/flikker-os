import { NotFoundException } from '@nestjs/common';
import { ExperienceVersion } from '@prisma/client';
import { CheckinService } from './checkin.service';
import { RedemptionService } from './redemption.service';

/**
 * Per-business rollout: the public Check-in V2 flow must be completely inert
 * for a business still on LEGACY — no Visit, no CustomerSession, no
 * CustomerEvent, no OTP, no scan bump — and must keep working untouched for a
 * business on CHECKIN_V2.
 */
function makeDeps(experienceVersion: ExperienceVersion) {
  const prisma = {
    customer: { findFirst: jest.fn(), create: jest.fn() },
    business: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'biz-1',
        name: 'Café Uno',
        logoUrl: null,
        primaryColor: null,
        checkinBackgroundColor: '#8A746B',
        googleBusinessProfileUrl: null,
        phone: null,
        timezone: 'America/Montevideo',
        checkinMinHoursBetweenVisits: 8,
        checkinMaxVisitsPerDay: 1,
        checkinReviewPromptEveryDays: 30,
        experienceVersion,
      }),
    },
    googleReview: { findFirst: jest.fn().mockResolvedValue(null) },
    customerEvent: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const sources = {
    findByToken: jest.fn().mockResolvedValue({
      id: 'src-1',
      name: 'Principal',
      type: 'qr',
      isActive: true,
      businessId: 'biz-1',
      business: { id: 'biz-1', isActive: true, experienceVersion },
    }),
    bumpScan: jest.fn().mockResolvedValue(undefined),
  };
  const visits = {
    registerVisit: jest.fn(),
    countByCustomer: jest.fn().mockResolvedValue(0),
    findLastByCustomer: jest.fn().mockResolvedValue(null),
  };
  const sessions = {
    issue: jest.fn(),
    resolveLive: jest.fn(),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const verifications = { start: jest.fn(), verify: jest.fn() };
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  const benefits = {
    resolveActiveBenefit: jest.fn().mockResolvedValue(null),
    grantWelcomeGift: jest.fn().mockResolvedValue(null),
    getWelcomeGiftState: jest.fn().mockResolvedValue(null),
    getOtherAvailableBenefits: jest.fn().mockResolvedValue([]),
    registerParticipation: jest.fn(),
    isRedeemable: jest.fn().mockReturnValue(false),
    ensureRedemptionCode: jest.fn(),
    findRedemption: jest.fn(),
  };
  const messaging = {
    sendWelcome: jest.fn(),
    sendOwnerNotification: jest.fn(),
    enqueueReviewRequest: jest.fn(),
    sendVerificationCode: jest.fn(),
  };
  const rewardGoals = {
    afterVisit: jest
      .fn()
      .mockResolvedValue({ goal: null, unlockedNow: false, benefit: null }),
    currentView: jest
      .fn()
      .mockResolvedValue({ goal: null, unlockedNow: false, benefit: null }),
  };
  const rewardGoalFeedback = {
    submit: jest.fn().mockResolvedValue({
      alreadySubmitted: false,
      bonusGranted: false,
      offerGoogle: false,
      rewardGoal: { goal: null, unlockedNow: false, benefit: null },
    }),
  };
  const flikkerAccount = {
    sendWelcomeLinkOnce: jest.fn().mockResolvedValue(undefined),
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
    rewardGoals,
    rewardGoalFeedback,
    flikkerAccount,
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
    deps.rewardGoals as never,
    deps.rewardGoalFeedback as never,
    deps.flikkerAccount as never,
  );
}

describe('Check-in V2 public flow — LEGACY business', () => {
  const legacy = () => makeDeps(ExperienceVersion.LEGACY);

  it('cannot open the landing (404, indistinguishable from an unknown token)', async () => {
    const deps = legacy();
    const service = makeService(deps);

    await expect(service.resolveLanding('tok')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // No scan is recorded either — the metric must stay untouched.
    expect(deps.sources.bumpScan).not.toHaveBeenCalled();
  });

  it('cannot register: no Customer, no Visit, no CustomerSession', async () => {
    const deps = legacy();
    const service = makeService(deps);

    await expect(
      service.register('tok', { name: 'Ana', phone: '099111222' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(deps.prisma.customer.create).not.toHaveBeenCalled();
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
    expect(deps.sessions.issue).not.toHaveBeenCalled();
    expect(deps.events.emit).not.toHaveBeenCalled();
  });

  it('cannot check in: no Visit is ever created', async () => {
    const deps = legacy();
    const service = makeService(deps);

    await expect(service.checkin('tok', 'sess')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
  });

  it('cannot start recovery: no OTP is generated or sent', async () => {
    const deps = legacy();
    const service = makeService(deps);

    await expect(
      service.recoverStart('tok', '099111222'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deps.verifications.start).not.toHaveBeenCalled();
    expect(deps.messaging.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('cannot verify recovery: no session is issued', async () => {
    const deps = legacy();
    const service = makeService(deps);

    await expect(
      service.recoverVerify('tok', '099111222', '123456'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deps.sessions.issue).not.toHaveBeenCalled();
  });

  it('cannot emit timeline events', async () => {
    const deps = legacy();
    const service = makeService(deps);

    await expect(
      service.emitClientEvent('tok', 'review_prompt_shown', 'sess'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deps.events.emit).not.toHaveBeenCalled();
  });

  it('cannot read the personal space through the session endpoint', async () => {
    const deps = legacy();
    deps.sessions.resolveLive.mockResolvedValue({
      id: 's-1',
      businessId: 'biz-1',
      customerId: 'c-1',
    });
    const service = makeService(deps);

    // The session is valid, but the business is legacy → nothing is disclosed.
    await expect(service.me('sess')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cannot submit feedback — same gate as "me", no CheckinFeedback and no bonus stamp are ever attempted', async () => {
    const deps = legacy();
    deps.sessions.resolveLive.mockResolvedValue({
      id: 's-1',
      businessId: 'biz-1',
      customerId: 'c-1',
    });
    const service = makeService(deps);

    await expect(
      service.submitFeedback('sess', 5, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deps.rewardGoalFeedback.submit).not.toHaveBeenCalled();
  });
});

describe('Check-in V2 public flow — CHECKIN_V2 business', () => {
  it('resolves the landing and records the scan as before', async () => {
    const deps = makeDeps(ExperienceVersion.CHECKIN_V2);
    const service = makeService(deps);

    const landing = await service.resolveLanding('tok');

    expect(landing.business.businessName).toBe('Café Uno');
    expect(landing.business.checkinBackgroundColor).toBe('#8A746B');
    expect(deps.sources.bumpScan).toHaveBeenCalledWith('src-1');
  });

  it('registers a first visit, issuing a session and a Visit', async () => {
    const deps = makeDeps(ExperienceVersion.CHECKIN_V2);
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
      visit: { id: 'v-1', attributionType: 'organic' },
    });
    deps.sessions.issue.mockResolvedValue({
      rawToken: 'raw',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    const service = makeService(deps);

    const result = await service.register('tok', {
      name: 'Ana',
      phone: '099111222',
    });

    expect(result.status).toBe('registered');
    expect(deps.visits.registerVisit).toHaveBeenCalledTimes(1);
    expect(deps.sessions.issue).toHaveBeenCalledTimes(1);
  });
});

describe('Benefit redemption rollout', () => {
  function makeRedemptionDeps(experienceVersion: ExperienceVersion) {
    return {
      prisma: {
        business: {
          findUnique: jest.fn().mockResolvedValue({
            timezone: 'America/Montevideo',
            experienceVersion,
          }),
        },
        membership: {
          findUnique: jest.fn().mockResolvedValue({
            role: 'OWNER',
            status: 'ACTIVE',
          }),
        },
        customerRewardGoal: {
          findFirst: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn(),
        },
      },
      benefits: {
        previewRedemption: jest.fn().mockResolvedValue({
          status: 'ok',
          businessId: 'biz-1',
          benefitTitle: '10% off',
          customerName: 'Ana',
        }),
        consumeRedemption: jest.fn(),
        attachRedeemedVisit: jest.fn(),
      },
      visits: { registerRedemptionVisit: jest.fn() },
      events: { emit: jest.fn() },
      decisions: { record: jest.fn() },
    };
  }

  it('LEGACY cannot redeem — the code is not even consumed', async () => {
    const deps = makeRedemptionDeps(ExperienceVersion.LEGACY);
    const service = new RedemptionService(
      deps.prisma as never,
      deps.benefits as never,
      deps.visits as never,
      deps.events as never,
      deps.decisions as never,
    );

    await expect(service.redeem('user-1', 'ABCD1234')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deps.benefits.consumeRedemption).not.toHaveBeenCalled();
    expect(deps.visits.registerRedemptionVisit).not.toHaveBeenCalled();
  });

  it('CHECKIN_V2 redeems and records the confirmed_redemption visit', async () => {
    const deps = makeRedemptionDeps(ExperienceVersion.CHECKIN_V2);
    deps.benefits.consumeRedemption.mockResolvedValue({
      status: 'ok',
      businessId: 'biz-1',
      participationId: 'p-1',
      benefitId: 'b-1',
      customerId: 'c-1',
      benefitTitle: '10% off',
      benefitType: 'discount',
      customerName: 'Ana',
    });
    deps.visits.registerRedemptionVisit.mockResolvedValue({ id: 'v-1' });
    const service = new RedemptionService(
      deps.prisma as never,
      deps.benefits as never,
      deps.visits as never,
      deps.events as never,
      deps.decisions as never,
    );

    await expect(service.redeem('user-1', 'ABCD1234')).resolves.toMatchObject({
      ok: true,
      visitId: 'v-1',
    });
  });
});
