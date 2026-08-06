import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RetentionExperimentsAdminService } from './retention-experiments-admin.service';
import { RetentionExperimentMetricsService } from './retention-experiment-metrics.service';
import { CreateRetentionExperimentDto } from './dto/create-retention-experiment.dto';
import { UpdateRetentionExperimentDto } from './dto/update-retention-experiment.dto';
import { CreateRetentionVariantDto } from './dto/create-retention-variant.dto';
import { UpdateRetentionVariantDto } from './dto/update-retention-variant.dto';

/** Fase C.5 §4 — experiments, their variants and their lifecycle. */
@Controller('retention-v2/experiments')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class RetentionExperimentsController {
  constructor(
    private readonly service: RetentionExperimentsAdminService,
    private readonly metrics: RetentionExperimentMetricsService,
  ) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.currentBusinessId!);
  }

  @Get(':id')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getOne(req.currentBusinessId!, id);
  }

  /**
   * Fase D §40. Read-only for every role the panel already lets in — closing
   * the experimental loop is exactly the information a VIEWER should be able
   * to see; only configuration (above) is edit-gated.
   */
  @Get(':id/results')
  results(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.metrics.forExperiment(req.currentBusinessId!, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateRetentionExperimentDto,
  ) {
    return this.service.create(req.currentBusinessId!, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateRetentionExperimentDto,
  ) {
    return this.service.update(req.currentBusinessId!, id, dto);
  }

  @Post(':id/variants')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  addVariant(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateRetentionVariantDto,
  ) {
    return this.service.addVariant(req.currentBusinessId!, id, dto);
  }

  @Patch(':id/variants/:variantId')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  updateVariant(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateRetentionVariantDto,
  ) {
    return this.service.updateVariant(
      req.currentBusinessId!,
      id,
      variantId,
      dto,
    );
  }

  @Post(':id/start')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  start(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.start(req.currentBusinessId!, id);
  }

  @Post(':id/pause')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  pause(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.pause(req.currentBusinessId!, id);
  }

  @Post(':id/finish')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  finish(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.finish(req.currentBusinessId!, id);
  }
}
