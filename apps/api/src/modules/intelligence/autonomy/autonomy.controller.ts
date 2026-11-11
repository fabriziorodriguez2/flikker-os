import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AutonomyMode, MembershipRole } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';
import type { AuthenticatedRequest } from '../../../common/types/request.types';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { AutonomyService } from './autonomy.service';
import { AutonomyAdminService } from './autonomy-admin.service';

export class SetAutonomyModeDto {
  @IsEnum(AutonomyMode)
  mode!: AutonomyMode;

  /** Clientes por corrida. Grupos chicos: el negocio piloto tiene ~105. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  pilotGroupSize?: number;

  /** Obligatorio para PILOT: el piloto con envíos reales se aprueba a mano. */
  @IsOptional()
  @IsBoolean()
  confirmPilot?: boolean;
}

/**
 * "Actividad autónoma" del negocio activo. Muestra costos y conteos del
 * negocio, así que es de dueño/admin. Prenderlo NO se hace desde acá (es de
 * Platform Admin); apagarlo sí.
 */
@Controller('intelligence/autonomy')
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
export class AutonomyController {
  constructor(
    private readonly admin: AutonomyAdminService,
    private readonly autonomy: AutonomyService,
  ) {}

  @Get()
  activity(@Req() req: AuthenticatedRequest) {
    return this.admin.activity(req.currentBusinessId!);
  }

  @Get('runs/:id')
  run(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.run(req.currentBusinessId!, id);
  }

  /** Simulación a pedido: el mismo plan, sin guardar ni reclutar nada. */
  @Post('preview')
  @HttpCode(200)
  preview(@Req() req: AuthenticatedRequest) {
    return this.autonomy.preview(req.currentBusinessId!);
  }

  @Post('disable')
  @HttpCode(200)
  disable(@Req() req: AuthenticatedRequest) {
    return this.admin.disable(req.currentBusinessId!, req.user.id);
  }
}

/** Platform Admin: el rollout por negocio (OFF → DRY_RUN → PILOT). */
@Controller('platform/businesses')
@UseGuards(JwtGuard, PlatformAdminGuard)
export class AutonomyPlatformController {
  constructor(private readonly admin: AutonomyAdminService) {}

  @Get(':businessId/autonomy')
  activity(@Param('businessId', ParseUUIDPipe) businessId: string) {
    return this.admin.activity(businessId, 10);
  }

  @Patch(':businessId/autonomy')
  setMode(
    @Req() req: AuthenticatedRequest,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: SetAutonomyModeDto,
  ) {
    return this.admin.setMode(businessId, req.user.id, dto);
  }
}
