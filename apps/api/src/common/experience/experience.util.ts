import { ExperienceVersion } from '@prisma/client';

/**
 * Single place that decides whether a business is on Check-in V2.
 *
 * Business.experienceVersion is the source of truth — never the frontend, and
 * never the build-time `config/features.ts` flags (those are global and cannot
 * tell one business from another).
 *
 * Use this predicate whenever the business row is already loaded in the current
 * request so no extra query is issued; use CheckinV2Guard on panel routes where
 * only `req.currentBusinessId` is available.
 */
export function isCheckinV2(
  business: { experienceVersion: ExperienceVersion } | null | undefined,
): boolean {
  return business?.experienceVersion === ExperienceVersion.CHECKIN_V2;
}

/**
 * Prisma `select` fragment for the rollout flags. Keeps every call site reading
 * the same fields instead of hand-writing selects that drift apart.
 */
export const EXPERIENCE_SELECT = {
  experienceVersion: true,
  retentionEngineV2Enabled: true,
} as const;
