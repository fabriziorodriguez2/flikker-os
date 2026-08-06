import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from '../types/request.types';
import { isCheckinV2 } from '../experience/experience.util';

/**
 * Gates panel routes that only make sense for a business on Check-in V2.
 *
 * Answers 404 (not 403) so a legacy business cannot tell the feature exists.
 * Must run after TenantGuard, which is what resolves `req.currentBusinessId`.
 *
 * The resolved value is cached on the request, so several guarded routes (or a
 * guard plus a service) in the same request only hit the database once.
 */
@Injectable()
export class CheckinV2Guard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const businessId = request.currentBusinessId;

    if (!businessId) throw new NotFoundException();

    if (request.currentExperienceVersion === undefined) {
      const business = await this.prisma.business.findUnique({
        where: { id: businessId },
        select: { experienceVersion: true },
      });
      if (!business) throw new NotFoundException();
      request.currentExperienceVersion = business.experienceVersion;
    }

    if (!isCheckinV2({ experienceVersion: request.currentExperienceVersion })) {
      throw new NotFoundException();
    }

    return true;
  }
}
