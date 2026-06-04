import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { BusinessGoalsService } from './business-goals.service';
import { CreateBusinessGoalDto } from './dto/create-business-goal.dto';

@Controller('business-goals')
@UseGuards(JwtGuard, TenantGuard)
export class BusinessGoalsController {
  constructor(private readonly service: BusinessGoalsService) {}

  @Get('current')
  getCurrent(@Req() req: AuthenticatedRequest) {
    return this.service.getCurrent(req.currentBusinessId!);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateBusinessGoalDto,
  ) {
    return this.service.create(req.currentBusinessId!, dto);
  }
}
