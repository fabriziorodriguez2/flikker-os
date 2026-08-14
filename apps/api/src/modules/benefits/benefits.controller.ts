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
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { BenefitsService } from './benefits.service';
import { CreateBenefitDto } from './dto/create-benefit.dto';
import { UpdateBenefitDto } from './dto/update-benefit.dto';
import { UpdateBenefitRetentionBridgeDto } from './dto/update-benefit-retention-bridge.dto';

@Controller('benefits')
@UseGuards(JwtGuard, TenantGuard)
export class BenefitsController {
  constructor(private readonly service: BenefitsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.currentBusinessId!);
  }

  // Must be declared before ':id' so "active" is not captured as an id.
  @Get('active')
  getActive(@Req() req: AuthenticatedRequest) {
    return this.service.getActive(req.currentBusinessId!);
  }

  @Get(':id')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getOne(req.currentBusinessId!, id);
  }

  @Get(':id/participants')
  getParticipants(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getParticipants(req.currentBusinessId!, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateBenefitDto) {
    return this.service.create(req.currentBusinessId!, dto, req.user.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateBenefitDto,
  ) {
    return this.service.update(req.currentBusinessId!, id, dto, req.user.id);
  }

  @Post(':id/activate')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  activate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.activate(req.currentBusinessId!, id);
  }

  /**
   * Regalo de bienvenida. Endpoint propio y no `activate`, porque son cosas
   * distintas: `active` = "visible en el check-in", bienvenida = "se entrega
   * una vez, en el registro".
   */
  @Post(':id/welcome-gift')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  setWelcomeGift(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.setWelcomeGift(req.currentBusinessId!, id);
  }

  @Delete('welcome-gift/current')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  clearWelcomeGift(@Req() req: AuthenticatedRequest) {
    return this.service.setWelcomeGift(req.currentBusinessId!, null);
  }

  @Post(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  deactivate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.deactivate(req.currentBusinessId!, id);
  }

  // Piloto V2 — the only place a Benefit gets authorized for Retention V2
  // recovery / reward-goal automation. Retention V2's own UI never creates.
  @Patch(':id/retention-bridge')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  setRetentionBridge(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateBenefitRetentionBridgeDto,
  ) {
    return this.service.setRetentionBridge(
      req.currentBusinessId!,
      id,
      dto,
      req.user.id,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.currentBusinessId!, id);
  }
}
