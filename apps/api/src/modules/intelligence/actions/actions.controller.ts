import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../../common/types/request.types';
import { INTELLIGENCE_CHAT_ROLES } from '../conversations.controller';
import { ACTION_ROLES, ActionsService } from './actions.service';

export class ConfirmActionDto {
  /** El plan exacto que vio el dueño en la tarjeta. */
  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  planHash!: string;
}

/**
 * Tarjetas de acción del agente. Confirmar es el único camino por el que se
 * ejecuta un cambio con impacto, y nunca sale del texto del chat: es este
 * POST autenticado, con el negocio de la sesión, el rol resuelto en backend y
 * el `planHash` de la propuesta.
 */
@Controller('intelligence/actions')
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Roles(...INTELLIGENCE_CHAT_ROLES)
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get(':id')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.actions.get(scopeOf(req), req.currentMembershipRole!, id);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Roles(...ACTION_ROLES)
  confirm(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfirmActionDto,
  ) {
    return this.actions.confirm(
      scopeOf(req),
      req.currentMembershipRole!,
      id,
      dto.planHash,
    );
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(...ACTION_ROLES)
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.actions.cancel(scopeOf(req), req.currentMembershipRole!, id);
  }
}

function scopeOf(req: AuthenticatedRequest) {
  return { businessId: req.currentBusinessId!, userId: req.user.id };
}
