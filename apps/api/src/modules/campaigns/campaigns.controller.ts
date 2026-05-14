import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { MembershipRole, CampaignStatus } from '@prisma/client';
import { CampaignsService } from './campaigns.service';
import { CampaignStatsService } from './campaigns.stats.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { UpdateRepeatCampaignDto } from './dto/update-repeat-campaign.dto';
import { UpdateCampaignStatusDto } from './dto/update-campaign-status.dto';
import { StatsQueryDto } from './dto/stats-query.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';

@Controller('campaigns')
@UseGuards(JwtGuard, TenantGuard)
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly statsService: CampaignStatsService,
  ) {}

  /**
   * Lists campaigns of the current business.
   * Optional filter: ?status=ACTIVE
   */
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: CampaignStatus,
  ) {
    return this.campaignsService.listForBusiness(
      req.currentBusinessId!,
      status,
      req.user.id,
    );
  }

  /**
   * Returns recent campaign executions for the current business.
   * Must be declared before :id to avoid route shadowing.
   */
  @Get('activity')
  recentActivity(@Req() req: AuthenticatedRequest) {
    return this.campaignsService.getRecentActivity(req.currentBusinessId!);
  }

  /**
   * Returns a specific campaign — must belong to the current business.
   */
  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.campaignsService.findOneScoped(req.currentBusinessId!, id);
  }

  /**
   * Returns scan stats for a campaign.
   * Optional query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to last 30 days).
   */
  @Get(':id/stats')
  async stats(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: StatsQueryDto,
  ) {
    await this.campaignsService.findOneScoped(req.currentBusinessId!, id);
    const range = CampaignStatsService.resolveDateRange(query.from, query.to);
    return this.statsService.getCampaignStats(
      req.currentBusinessId!,
      id,
      range,
    );
  }

  /**
   * Creates a new campaign — OWNER or ADMIN only.
   * Validates plan limits atomically.
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(
      req.currentBusinessId!,
      dto,
      req.user.id,
    );
  }

  /**
   * Updates a campaign — OWNER or ADMIN only.
   */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(
      req.currentBusinessId!,
      id,
      dto,
      req.user.id,
    );
  }

  @Patch(':id/repeats')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  updateRepeatSettings(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateRepeatCampaignDto,
  ) {
    return this.campaignsService.updateRepeatSettings(
      req.currentBusinessId!,
      id,
      dto,
      req.user.id,
    );
  }

  /**
   * Changes campaign status — OWNER or ADMIN only.
   * Validates transition rules.
   */
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignStatusDto,
  ) {
    return this.campaignsService.updateStatus(req.currentBusinessId!, id, dto);
  }
}
