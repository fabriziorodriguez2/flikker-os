'use client';

import { createContext, useContext } from 'react';

export type ExperienceVersion = 'LEGACY' | 'CHECKIN_V2';

interface ExperienceContextValue {
  experienceVersion: ExperienceVersion;
  retentionEngineV2Enabled: boolean;
}

/**
 * Per-business rollout flags, resolved server-side in the panel layout from
 * GET /businesses/current.
 *
 * This only drives what the panel renders. It is never the security boundary:
 * every V2 endpoint is independently gated by CheckinV2Guard on the API, so
 * hiding a menu entry is a UX detail, not the protection itself.
 *
 * Defaults to LEGACY so a failed or partial fetch never exposes V2 by accident.
 */
const ExperienceContext = createContext<ExperienceContextValue>({
  experienceVersion: 'LEGACY',
  retentionEngineV2Enabled: false,
});

export function ExperienceProvider({
  experienceVersion,
  retentionEngineV2Enabled,
  children,
}: ExperienceContextValue & { children: React.ReactNode }) {
  return (
    <ExperienceContext.Provider
      value={{ experienceVersion, retentionEngineV2Enabled }}
    >
      {children}
    </ExperienceContext.Provider>
  );
}

export function useExperience() {
  return useContext(ExperienceContext);
}

/** True only when this business is on Check-in V2. */
export function useIsCheckinV2() {
  return useExperience().experienceVersion === 'CHECKIN_V2';
}
