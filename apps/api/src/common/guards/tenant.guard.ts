import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from '../types/request.types';

/**
 * Validates that the requesting user has an active membership in the business
 * identified by the `x-business-id` header.
 *
 * Sets on the request:
 *   - req.currentBusinessId  (string)
 *   - req.currentMembershipRole  (MembershipRole)
 *
 * Must run after JwtGuard (requires req.user).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const businessId = request.headers['x-business-id'] as string | undefined;

    if (!user) throw new ForbiddenException();

    if (user.isImpersonating) {
      if (!user.isPlatformAdmin || !user.impersonatedBusinessId) {
        throw new ForbiddenException('Invalid impersonation token');
      }

      if (businessId && businessId !== user.impersonatedBusinessId) {
        throw new ForbiddenException('Impersonation business mismatch');
      }

      request.currentBusinessId = user.impersonatedBusinessId;
      request.currentMembershipRole = MembershipRole.OWNER;
      return true;
    }

    if (!businessId)
      throw new ForbiddenException('Missing x-business-id header');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
      select: { role: true, status: true },
    });

    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new ForbiddenException('No active membership in this business');
    }

    request.currentBusinessId = businessId;
    request.currentMembershipRole = membership.role;

    return true;
  }
}
