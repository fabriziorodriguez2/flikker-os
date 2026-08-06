import type { Request } from 'express';
import { ExperienceVersion, MembershipRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isPlatformAdmin: boolean;
  isImpersonating?: boolean;
  impersonatedBusinessId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  currentBusinessId?: string;
  currentMembershipRole?: MembershipRole;
  /** Cached by CheckinV2Guard so one request never re-queries the rollout flag. */
  currentExperienceVersion?: ExperienceVersion;
}
