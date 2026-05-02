import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { ReviewTagsService } from './review-tags.service';
import { CreateReviewTagDto } from './dto/create-review-tag.dto';
import { UpdateReviewTagDto } from './dto/update-review-tag.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';

@Controller('reviews')
@UseGuards(FeatureFlagGuard('REVIEW_TAGS'), JwtGuard, TenantGuard)
export class ReviewTagsController {
  constructor(private readonly tagsService: ReviewTagsService) {}

  /** Lists all review tags for the current business. */
  @Get('tags')
  listTags(@Req() req: AuthenticatedRequest) {
    return this.tagsService.listForBusiness(req.currentBusinessId!);
  }

  /** Creates a new review tag — OWNER or ADMIN only. */
  @Post('tags')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  createTag(@Req() req: AuthenticatedRequest, @Body() dto: CreateReviewTagDto) {
    return this.tagsService.create(req.currentBusinessId!, dto);
  }

  /** Updates a review tag — OWNER or ADMIN only. */
  @Patch('tags/:tagId')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  updateTag(
    @Req() req: AuthenticatedRequest,
    @Param('tagId') tagId: string,
    @Body() dto: UpdateReviewTagDto,
  ) {
    return this.tagsService.update(req.currentBusinessId!, tagId, dto);
  }

  /** Deletes a review tag and its relations — OWNER or ADMIN only. */
  @Delete('tags/:tagId')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTag(@Req() req: AuthenticatedRequest, @Param('tagId') tagId: string) {
    return this.tagsService.delete(req.currentBusinessId!, tagId);
  }

  /** Assigns a tag to a review — OWNER, ADMIN or OPERATOR. */
  @Post(':reviewId/tags/:tagId')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  @HttpCode(HttpStatus.CREATED)
  assignTag(
    @Req() req: AuthenticatedRequest,
    @Param('reviewId') reviewId: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tagsService.assignTag(req.currentBusinessId!, reviewId, tagId);
  }

  /** Removes a tag from a review — OWNER, ADMIN or OPERATOR. */
  @Delete(':reviewId/tags/:tagId')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  unassignTag(
    @Req() req: AuthenticatedRequest,
    @Param('reviewId') reviewId: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tagsService.unassignTag(
      req.currentBusinessId!,
      reviewId,
      tagId,
    );
  }
}
