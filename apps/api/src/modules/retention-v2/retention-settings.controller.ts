import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RetentionSettingsService } from './retention-settings.service';
import { UpdateRetentionSettingsDto } from './dto/update-retention-settings.dto';

/**
 * Fase C.5 §2 — the owner's configuration surface for Retention V2, so no
 * setting requires SQL. Every read and write is scoped to `currentBusinessId`,
 * resolved by TenantGuard from the caller's membership — never from anything
 * the client sends.
 */
@Controller('retention-v2/settings')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class RetentionSettingsController {
  constructor(private readonly settings: RetentionSettingsService) {}

  @Get()
  async get(@Req() req: AuthenticatedRequest) {
    const businessId = req.currentBusinessId!;
    const [settings, warning] = await Promise.all([
      this.settings.getOrCreate(businessId),
      this.settings.budgetWarning(businessId),
    ]);
    return { ...settings, ...warning };
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  async update(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateRetentionSettingsDto,
  ) {
    const businessId = req.currentBusinessId!;
    const settings = await this.settings.update(businessId, dto);
    const warning = await this.settings.budgetWarning(businessId);
    return { ...settings, ...warning };
  }
}
