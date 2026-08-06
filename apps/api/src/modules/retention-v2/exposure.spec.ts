import { RetentionAssignmentStatus } from '@prisma/client';
import { EXPOSED_STATUSES, isExposed } from './exposure';

describe('isExposed — Fase D §4 denominator', () => {
  it('OBSERVING (CONTROL) counts as exposed', () => {
    expect(isExposed(RetentionAssignmentStatus.OBSERVING)).toBe(true);
  });

  it('SENT counts as exposed', () => {
    expect(isExposed(RetentionAssignmentStatus.SENT)).toBe(true);
  });

  it('PENDING never counts — nothing happened yet', () => {
    expect(isExposed(RetentionAssignmentStatus.PENDING)).toBe(false);
  });

  it('SKIPPED never counts — rejected before exposure', () => {
    expect(isExposed(RetentionAssignmentStatus.SKIPPED)).toBe(false);
  });

  it('is exactly OBSERVING and SENT, nothing else', () => {
    expect(EXPOSED_STATUSES.sort()).toEqual(
      [
        RetentionAssignmentStatus.OBSERVING,
        RetentionAssignmentStatus.SENT,
      ].sort(),
    );
  });
});
