import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
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
}
