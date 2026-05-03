import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateBusinessStatusDto } from './dto/update-business-status.dto';
import { UpdateBrandProfileDto } from './dto/update-brand-profile.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('businesses')
@UseGuards(JwtGuard)
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  /**
   * Creates a new business — no tenant context needed (user is creating a new one).
   * The service makes the creator the OWNER.
   */
  @Post()
  create(@Body() dto: CreateBusinessDto, @CurrentUser() user: { id: string }) {
    return this.businessesService.create(dto, user.id);
  }

  /**
   * Lists all businesses the authenticated user belongs to.
   * Tenancy enforced at service level — no x-business-id needed.
   */
  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.businessesService.findAllForUser(user.id);
  }

  /**
   * Returns the business from the current tenant context (x-business-id).
   * Declared before :id to avoid route collision.
   */
  @Get('current')
  @UseGuards(TenantGuard)
  findCurrent(@Req() req: AuthenticatedRequest) {
    return this.businessesService.findCurrent(req.currentBusinessId!);
  }

  /**
   * Returns the brand profile of the current business.
   */
  @Get('current/brand')
  @UseGuards(TenantGuard)
  getBrandProfile(@Req() req: AuthenticatedRequest) {
    return this.businessesService.getBrandProfile(req.currentBusinessId!);
  }

  /**
   * Updates the brand profile of the current business — OWNER or ADMIN only.
   */
  @Patch('current/brand')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  updateBrandProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateBrandProfileDto,
  ) {
    return this.businessesService.updateBrandProfile(
      req.currentBusinessId!,
      dto,
    );
  }

  /**
   * Returns a specific business.
   * TenantGuard validates membership; we use the trusted currentBusinessId.
   */
  @Get(':id')
  @UseGuards(TenantGuard)
  findOne(@Req() req: AuthenticatedRequest) {
    return this.businessesService.findCurrent(req.currentBusinessId!);
  }

  /**
   * Updates business profile — requires OWNER or ADMIN role.
   * TenantGuard validates membership; RolesGuard checks the role.
   */
  @Patch(':id')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(@Req() req: AuthenticatedRequest, @Body() dto: UpdateBusinessDto) {
    return this.businessesService.update(
      req.currentBusinessId!,
      dto,
      req.user.id,
    );
  }

  /**
   * Changes business status — OWNER only. Validates transition rules.
   */
  @Patch(':id/status')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER)
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateBusinessStatusDto,
  ) {
    return this.businessesService.updateStatus(req.currentBusinessId!, dto);
  }
}
