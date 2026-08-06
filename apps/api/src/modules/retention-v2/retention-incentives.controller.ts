import {
  Body,
  Controller,
  Delete,
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
import { RetentionIncentivesService } from './retention-incentives.service';
import { CreateRetentionIncentiveDto } from './dto/create-retention-incentive.dto';
import { UpdateRetentionIncentiveDto } from './dto/update-retention-incentive.dto';

/** Fase C.5 §3 — the owner's catalogue of incentives Flikker MAY offer. */
@Controller('retention-v2/incentives')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class RetentionIncentivesController {
  constructor(private readonly service: RetentionIncentivesService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.currentBusinessId!);
  }

  @Get(':id')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getOne(req.currentBusinessId!, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateRetentionIncentiveDto,
  ) {
    return this.service.create(req.currentBusinessId!, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateRetentionIncentiveDto,
  ) {
    return this.service.update(req.currentBusinessId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.currentBusinessId!, id);
  }
}
