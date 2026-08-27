import { hasEnoughRetentionEvidence } from './business-impact';

describe('hasEnoughRetentionEvidence', () => {
  it('es false solo cuando el evidenceState es INSUFFICIENT_DATA', () => {
    expect(hasEnoughRetentionEvidence('INSUFFICIENT_DATA')).toBe(false);
  });

  it('es true con evidencia preliminar o suficiente', () => {
    expect(hasEnoughRetentionEvidence('PRELIMINARY')).toBe(true);
    expect(hasEnoughRetentionEvidence('ENOUGH_DATA')).toBe(true);
  });
});
