import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { PlatformService } from './platform.service';

@Controller('platform')
@UseGuards(JwtGuard, PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  /**
   * Lists all businesses with stats — platform admins only.
   * Cross-tenant: no x-business-id needed.
   */
  @Get('businesses')
  listBusinesses() {
    return this.platformService.listBusinesses();
  }

  @Get('audit-logs')
  listAuditLogs() {
    return this.platformService.listAuditLogs();
  }

  @Post('businesses/:businessId/impersonate')
  impersonate(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
  ) {
    return this.platformService.impersonate(req.user.id, businessId);
  }

  @Post('exit-impersonation')
  exitImpersonation() {
    return { ok: true };
  }
}
