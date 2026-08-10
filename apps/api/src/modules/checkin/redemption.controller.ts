import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RedemptionService } from './redemption.service';

class RedeemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code!: string;
}

/**
 * Staff-facing benefit validation. Owners/admins and counter operators can
 * validate a customer's redemption code. Tenant-scoped and role-guarded.
 */
@Controller('redemptions')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class RedemptionController {
  constructor(private readonly service: RedemptionService) {}

  // Piloto V2 (#5) — lectura, nunca consume. El "Escanear recompensa" del
  // empleado llama esto primero para mostrar "Beneficio: X / Cliente: Y";
  // recién al tocar "Confirmar canje" el frontend llama /redeem con el
  // mismo código.
  @Post('preview')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  preview(@Req() req: AuthenticatedRequest, @Body() dto: RedeemDto) {
    return this.service.preview(req.currentBusinessId!, dto.code);
  }

  @Post('redeem')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  redeem(@Req() req: AuthenticatedRequest, @Body() dto: RedeemDto) {
    return this.service.redeem(req.currentBusinessId!, req.user.id, dto.code);
  }
}
