import { ExperienceVersion } from '@prisma/client';
import { isCheckinV2 } from './experience.util';

describe('isCheckinV2', () => {
  it('is true only for CHECKIN_V2', () => {
    expect(
      isCheckinV2({ experienceVersion: ExperienceVersion.CHECKIN_V2 }),
    ).toBe(true);
  });

  it('is false for LEGACY — the default every business starts on', () => {
    expect(isCheckinV2({ experienceVersion: ExperienceVersion.LEGACY })).toBe(
      false,
    );
  });

  it('is false for a missing business, so nothing opens up by accident', () => {
    expect(isCheckinV2(null)).toBe(false);
    expect(isCheckinV2(undefined)).toBe(false);
  });
});
