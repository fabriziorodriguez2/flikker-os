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
import { MembershipRole } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { UpdateReviewStatusDto } from './dto/update-review-status.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';

@Controller('reviews')
@UseGuards(JwtGuard, TenantGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * Lists reviews for the current business with filtering, sorting and pagination.
   */
  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListReviewsQueryDto) {
    return this.reviewsService.listForBusiness(req.currentBusinessId!, query);
  }

  /**
   * Returns a single review with relations — must belong to the current business.
   */
  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reviewsService.findOneScoped(req.currentBusinessId!, id);
  }

  /**
   * Creates a manual review — OWNER or ADMIN only.
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(req.currentBusinessId!, dto, req.user.id);
  }

  /**
   * Updates operational metadata of a review — OWNER or ADMIN only.
   */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(req.currentBusinessId!, id, dto);
  }

  /**
   * Marks a review as highlighted for widget usage.
   */
  @Post(':id/highlight')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  highlight(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reviewsService.highlight(req.currentBusinessId!, id);
  }

  /**
   * Removes the highlighted flag from a review.
   */
  @Post(':id/unhighlight')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  unhighlight(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reviewsService.unhighlight(req.currentBusinessId!, id);
  }

  /**
   * Marks a review as responded and persists who did it and when.
   */
  @Post(':id/mark-responded')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  markResponded(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reviewsService.markResponded(
      req.currentBusinessId!,
      id,
      req.user.id,
    );
  }

  /**
   * Reverts a review back to an unresponded operational state.
   */
  @Post(':id/mark-unresponded')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  markUnresponded(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reviewsService.markUnresponded(
      req.currentBusinessId!,
      id,
      req.user.id,
    );
  }

  /**
   * Changes review status — OWNER, ADMIN or OPERATOR.
   * Validates transition rules (state machine).
   */
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.reviewsService.updateStatus(
      req.currentBusinessId!,
      id,
      dto,
      req.user.id,
    );
  }
}
