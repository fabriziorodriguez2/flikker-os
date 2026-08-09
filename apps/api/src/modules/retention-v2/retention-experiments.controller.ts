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
import { AiRecommendationExplanationService } from '../ai/recommendation-explanation.service';
import { RetentionOptimizationService } from './retention-optimization.service';
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
    private readonly explanation: AiRecommendationExplanationService,
    private readonly optimization: RetentionOptimizationService,
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

  /**
   * Fase F §22 — an optional AI-written explanation of the SAME `results`
   * above. Never a second source of truth: null (no explanation) when AI is
   * off, not configured, over its cap, or the model's text ever contradicted
   * the engine's own winner — the numbers and the recommendation always come
   * from `results` regardless of what this returns.
   */
  @Get(':id/explanation')
  explain(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.explanation.explain(req.currentBusinessId!, id);
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

  // ── Fase G — Safe Auto-Optimization ─────────────────────────────────────

  /**
   * Fase G §27 — computes and stores a proposal, applies nothing. Read-only
   * for every role the panel lets in, same as `:id/results` above.
   */
  @Post(':id/optimization/preview')
  preview(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.optimization.preview(req.currentBusinessId!, id);
  }

  /**
   * Fase G §28 — OWNER/ADMIN only. Uses the exact same
   * `RetentionOptimizationService` the automatic worker uses — no separate
   * logic. Allowed whenever `optimizationMode` is ASSISTED or AUTOMATIC
   * (this IS the "dueño confirma" action in ASSISTED mode); rejected when
   * OFF.
   */
  @Post(':id/optimization/apply')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  applyOptimization(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.optimization.apply(req.currentBusinessId!, id);
  }

  /**
   * Fase G §38 — restores the allocation from just before the most recent
   * APPLIED run. Creates a new, auditable run; never deletes history and
   * never touches an existing `RetentionAssignment`.
   */
  @Post(':id/optimization/rollback')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  rollbackOptimization(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.optimization.rollback(req.currentBusinessId!, id);
  }

  /** Fase G §31 — history, most recent first. Read-only. */
  @Get(':id/optimization/history')
  optimizationHistory(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.optimization.history(req.currentBusinessId!, id);
  }
}
