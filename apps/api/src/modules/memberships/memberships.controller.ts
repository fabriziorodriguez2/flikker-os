import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { MembershipsService } from './memberships.service';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';

@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  /**
   * Lists all active members of the current business.
   */
  @Get()
  @UseGuards(JwtGuard, TenantGuard)
  list(@Req() req: AuthenticatedRequest) {
    return this.membershipsService.listForBusiness(req.currentBusinessId!);
  }

  /**
   * Returns the membership details of a specific user within the current business.
   */
  @Get(':userId')
  @UseGuards(JwtGuard, TenantGuard)
  findOne(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.membershipsService.findOne(req.currentBusinessId!, userId);
  }

  /**
   * Adds a user to the business.
   * OWNER can assign any role. ADMIN can only assign OPERATOR or VIEWER.
   */
  @Post()
  @UseGuards(FeatureFlagGuard('MULTI_USER'), JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  addMember(@Req() req: AuthenticatedRequest, @Body() dto: AddMemberDto) {
    return this.membershipsService.addMember(
      req.currentBusinessId!,
      dto,
      req.currentMembershipRole!,
      req.user.id,
    );
  }

  /**
   * Changes the role of a member — OWNER only.
   */
  @Patch(':id/role')
  @UseGuards(FeatureFlagGuard('MULTI_USER'), JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER)
  updateRole(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.membershipsService.updateRole(req.currentBusinessId!, id, dto);
  }

  /**
   * Revokes a membership — OWNER only.
   */
  @Patch(':id/revoke')
  @UseGuards(FeatureFlagGuard('MULTI_USER'), JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER)
  revoke(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.membershipsService.revoke(req.currentBusinessId!, id);
  }
}
