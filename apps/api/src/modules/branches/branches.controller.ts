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
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';

@Controller('branches')
@UseGuards(FeatureFlagGuard('MULTI_LOCAL'), JwtGuard, TenantGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  /**
   * Lists branches of the current business.
   * By default only active branches. Pass ?includeInactive=true for all.
   */
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.branchesService.listForBusiness(
      req.currentBusinessId!,
      includeInactive === 'true',
    );
  }

  /**
   * Returns a specific branch — must belong to the current business.
   */
  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.branchesService.findOneScoped(req.currentBusinessId!, id);
  }

  /**
   * Creates a new branch — OWNER or ADMIN only.
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(req.currentBusinessId!, dto);
  }

  /**
   * Updates a branch — OWNER or ADMIN only.
   */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchesService.update(req.currentBusinessId!, id, dto);
  }
}
