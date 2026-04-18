import type { Request } from 'express';
import { MembershipRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isPlatformAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  currentBusinessId?: string;
  currentMembershipRole?: MembershipRole;
}
