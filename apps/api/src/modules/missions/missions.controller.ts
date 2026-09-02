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
import {
  CreateMissionDto,
  SetMissionStatusDto,
  UpdateMissionDto,
} from './dto/mission.dto';
import { MissionService } from './mission.service';
import { MISSION_TEMPLATES } from './mission-templates';

/**
 * `/missions/*` — el backend de Programa → Misiones.
 *
 * Misma política de permisos que `/loyalty-program/*`, sin inventar nada
 * propio: leer lo puede cualquier miembro, escribir solo OWNER/ADMIN, y
 * `CheckinV2Guard` responde 404 en LEGACY.
 */
@Controller('missions')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class MissionsController {
  constructor(private readonly missions: MissionService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.missions.list(req.currentBusinessId!);
  }

  /** Los presets del editor. Constante — no depende del negocio. */
  @Get('templates')
  templates() {
    return MISSION_TEMPLATES;
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateMissionDto) {
    return this.missions.create(req.currentBusinessId!, {
      ...dto,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    });
  }

  @Patch(':missionId')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('missionId') missionId: string,
    @Body() dto: UpdateMissionDto,
  ) {
    return this.missions.update(req.currentBusinessId!, missionId, dto);
  }

  @Patch(':missionId/status')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  setStatus(
    @Req() req: AuthenticatedRequest,
    @Param('missionId') missionId: string,
    @Body() dto: SetMissionStatusDto,
  ) {
    return this.missions.setStatus(
      req.currentBusinessId!,
      missionId,
      dto.status,
    );
  }

  @Delete(':missionId')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('missionId') missionId: string,
  ) {
    return this.missions.remove(req.currentBusinessId!, missionId);
  }
}
