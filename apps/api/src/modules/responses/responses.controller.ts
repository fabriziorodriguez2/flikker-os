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
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { ResponsesService } from './responses.service';
import { CreateResponseDto } from './dto/create-response.dto';
import { UpdateResponseDto } from './dto/update-response.dto';

@Controller()
@UseGuards(FeatureFlagGuard('MANUAL_RESPONSES'), JwtGuard, TenantGuard)
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post('responses')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateResponseDto) {
    return this.responsesService.create(
      req.currentBusinessId!,
      dto,
      req.user.id,
    );
  }

  @Get('reviews/:reviewId/response')
  findByReview(
    @Req() req: AuthenticatedRequest,
    @Param('reviewId') reviewId: string,
  ) {
    return this.responsesService.findByReview(req.currentBusinessId!, reviewId);
  }

  @Patch('responses/:responseId')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('responseId') responseId: string,
    @Body() dto: UpdateResponseDto,
  ) {
    return this.responsesService.update(
      req.currentBusinessId!,
      responseId,
      dto,
      req.user.id,
    );
  }
}
