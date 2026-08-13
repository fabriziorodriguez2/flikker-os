import { CustomerSegment, ExperienceVersion } from '@prisma/client';
import { evaluateEligibility, type EligibilityFacts } from './eligibility';

const NOW = new Date('2026-08-31T12:00:00.000Z');

function facts(overrides: Partial<EligibilityFacts> = {}): EligibilityFacts {
  return {
    business: {
      isActive: true,
      experienceVersion: ExperienceVersion.CHECKIN_V2,
      retentionEngineV2Enabled: true,
    },
    settings: {
      automationEnabled: true,
      minimumDaysBetweenRetentionMessages: 14,
      maximumRetentionMessagesPer30Days: 2,
    },
    customer: { isActive: true, optedOut: false, phoneE164: '+59891111111' },
    segment: CustomerSegment.AT_RISK,
    lastRetentionMessageAt: null,
    retentionMessagesLast30Days: 0,
    alreadyAssigned: false,
    returnedSinceEvaluation: false,
    now: NOW,
    ...overrides,
  };
}

describe('evaluateEligibility — kill switch', () => {
  it('accepts a healthy AT_RISK customer on an enabled business', () => {
    expect(evaluateEligibility(facts())).toEqual({ eligible: true });
  });

  it('rejects a LEGACY business — the engine may never touch it', () => {
    const result = evaluateEligibility(
      facts({
        business: {
          isActive: true,
          experienceVersion: ExperienceVersion.LEGACY,
          retentionEngineV2Enabled: true,
        },
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'NOT_CHECKIN_V2' });
  });

  it('rejects when the engine flag is off, even on CHECKIN_V2', () => {
    const result = evaluateEligibility(
      facts({
        business: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: false,
        },
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'ENGINE_DISABLED' });
  });

  it('the platform kill switch outranks the owner kill switch (Fase C.5 §7)', () => {
    // Two independent switches: retentionEngineV2Enabled is the platform's,
    // automationEnabled is the owner's. When both are off, the reason
    // must be the platform one — an owner re-enabling their own switch must
    // never look like it did anything while the platform switch stays off.
    const result = evaluateEligibility(
      facts({
        business: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: false,
        },
        settings: {
          automationEnabled: false,
          minimumDaysBetweenRetentionMessages: 14,
          maximumRetentionMessagesPer30Days: 2,
        },
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'ENGINE_DISABLED' });
  });

  it('rejects an inactive business', () => {
    const result = evaluateEligibility(
      facts({
        business: {
          isActive: false,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
        },
      }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'BUSINESS_INACTIVE',
    });
  });

  it('rejects when the owner turned automatic campaigns off', () => {
    const result = evaluateEligibility(
      facts({
        settings: {
          automationEnabled: false,
          minimumDaysBetweenRetentionMessages: 14,
          maximumRetentionMessagesPer30Days: 2,
        },
      }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'AUTOMATION_DISABLED',
    });
  });
});

describe('evaluateEligibility — consent and reachability', () => {
  it('rejects an opted-out customer', () => {
    const result = evaluateEligibility(
      facts({
        customer: { isActive: true, optedOut: true, phoneE164: '+59891111111' },
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'OPTED_OUT' });
  });

  it('rejects a customer with no usable phone', () => {
    expect(
      evaluateEligibility(
        facts({
          customer: { isActive: true, optedOut: false, phoneE164: null },
        }),
      ),
    ).toEqual({ eligible: false, reasonCode: 'NO_CONTACT_CHANNEL' });

    expect(
      evaluateEligibility(
        facts({
          customer: { isActive: true, optedOut: false, phoneE164: '   ' },
        }),
      ),
    ).toEqual({ eligible: false, reasonCode: 'NO_CONTACT_CHANNEL' });
  });

  it('rejects a deleted customer', () => {
    const result = evaluateEligibility(
      facts({
        customer: {
          isActive: false,
          optedOut: false,
          phoneE164: '+59891111111',
        },
      }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'CUSTOMER_INACTIVE',
    });
  });
});

describe('evaluateEligibility — targeting', () => {
  it.each([
    CustomerSegment.NEW,
    CustomerSegment.REPEAT,
    CustomerSegment.FREQUENT,
    CustomerSegment.RECOVERED,
  ])('leaves %s customers alone', (segment) => {
    expect(evaluateEligibility(facts({ segment }))).toEqual({
      eligible: false,
      reasonCode: 'SEGMENT_NOT_TARGETABLE',
    });
  });

  it.each([CustomerSegment.AT_RISK, CustomerSegment.INACTIVE])(
    'targets %s customers',
    (segment) => {
      expect(evaluateEligibility(facts({ segment }))).toEqual({
        eligible: true,
      });
    },
  );

  it('skips the segment-targetability check entirely when segment is null (population already resolved upstream, e.g. reward-goal-progress recruitment)', () => {
    expect(evaluateEligibility(facts({ segment: null }))).toEqual({
      eligible: true,
    });
  });
});

describe('evaluateEligibility — contact pressure', () => {
  it('rejects while the cooldown is still running', () => {
    const result = evaluateEligibility(
      facts({
        lastRetentionMessageAt: new Date('2026-08-25T12:00:00.000Z'), // 6 days
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'COOLDOWN_ACTIVE' });
  });

  it('accepts once the cooldown has elapsed', () => {
    const result = evaluateEligibility(
      facts({
        lastRetentionMessageAt: new Date('2026-08-10T12:00:00.000Z'), // 21 days
      }),
    );
    expect(result).toEqual({ eligible: true });
  });

  it('rejects when the 30-day message cap is reached', () => {
    const result = evaluateEligibility(
      facts({ retentionMessagesLast30Days: 2 }),
    );
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'MONTHLY_LIMIT_REACHED',
    });
  });
});

describe('evaluateEligibility — races and duplicates', () => {
  it('rejects a customer who already came back (re-checked before sending)', () => {
    const result = evaluateEligibility(
      facts({ returnedSinceEvaluation: true }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'ALREADY_RETURNED' });
  });

  it('takes the return over the cooldown, so the reason is the useful one', () => {
    const result = evaluateEligibility(
      facts({
        returnedSinceEvaluation: true,
        lastRetentionMessageAt: new Date('2026-08-30T12:00:00.000Z'),
      }),
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'ALREADY_RETURNED' });
  });

  it('rejects a customer already recruited into the experiment', () => {
    const result = evaluateEligibility(facts({ alreadyAssigned: true }));
    expect(result).toEqual({ eligible: false, reasonCode: 'ALREADY_ASSIGNED' });
  });
});
