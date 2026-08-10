import { computeNextSteps, type NextStepsInput } from './dashboard-next-steps';

const BASE: NextStepsInput = {
  experienceVersion: 'CHECKIN_V2',
  retentionEngineEnabled: true,
  retentionDryRunEnabled: false,
  hasRetentionExperiment: true,
  rewardGoalsEnabled: true,
  hasAnyBenefit: true,
  hasAuthorizedBenefit: true,
  hasActiveVisitSource: true,
  reviewsTotal: 50,
  reviewsInPeriod: 5,
};

describe('computeNextSteps', () => {
  it('returns nothing when every condition is already healthy', () => {
    expect(computeNextSteps(BASE)).toEqual([]);
  });

  it('suggests reviewing Observación before going live', () => {
    const steps = computeNextSteps({ ...BASE, retentionDryRunEnabled: true });
    expect(steps[0].id).toBe('retention-observing');
  });

  it('suggests activating Reward Goals when off, only for CHECKIN_V2', () => {
    const steps = computeNextSteps({ ...BASE, rewardGoalsEnabled: false });
    expect(steps.map((s) => s.id)).toContain('reward-goals-off');

    const legacySteps = computeNextSteps({
      ...BASE,
      experienceVersion: 'LEGACY',
      rewardGoalsEnabled: false,
    });
    expect(legacySteps.map((s) => s.id)).not.toContain('reward-goals-off');
  });

  it('suggests creating a first benefit when none exist', () => {
    const steps = computeNextSteps({
      ...BASE,
      hasAnyBenefit: false,
      hasAuthorizedBenefit: false,
    });
    expect(steps.map((s) => s.id)).toContain('no-benefits');
    // No pide "autorizar" si ni siquiera hay beneficios creados.
    expect(steps.map((s) => s.id)).not.toContain('benefits-not-authorized');
  });

  it('suggests authorizing a benefit when some exist but none are authorized', () => {
    const steps = computeNextSteps({
      ...BASE,
      hasAnyBenefit: true,
      hasAuthorizedBenefit: false,
    });
    expect(steps.map((s) => s.id)).toContain('benefits-not-authorized');
  });

  it('suggests configuring the main QR when there is no active VisitSource', () => {
    const steps = computeNextSteps({ ...BASE, hasActiveVisitSource: false });
    expect(steps.map((s) => s.id)).toContain('no-qr-source');
  });

  it('suggests creating an experiment when Retention is on but nothing measures it', () => {
    const steps = computeNextSteps({ ...BASE, hasRetentionExperiment: false });
    expect(steps.map((s) => s.id)).toContain('no-experiment');
  });

  it('suggests boosting reviews when there are very few', () => {
    const steps = computeNextSteps({
      ...BASE,
      reviewsTotal: 3,
      reviewsInPeriod: 0,
    });
    expect(steps.map((s) => s.id)).toContain('low-reviews');
  });

  it('never returns more than 3 suggestions, in priority order', () => {
    const steps = computeNextSteps({
      ...BASE,
      retentionDryRunEnabled: true,
      rewardGoalsEnabled: false,
      hasAnyBenefit: false,
      hasAuthorizedBenefit: false,
      hasActiveVisitSource: false,
      hasRetentionExperiment: false,
      reviewsTotal: 0,
      reviewsInPeriod: 0,
    });
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.id)).toEqual([
      'retention-observing',
      'reward-goals-off',
      'no-benefits',
    ]);
  });

  it('every suggestion has a CTA', () => {
    const steps = computeNextSteps({ ...BASE, rewardGoalsEnabled: false });
    for (const step of steps) {
      expect(step.ctaHref).toMatch(/^\//);
      expect(step.ctaLabel.length).toBeGreaterThan(0);
    }
  });
});
