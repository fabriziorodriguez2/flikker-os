import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { CheckinPresenceMode, MembershipRole } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceChallengeService } from './presence-challenge.service';

export class UpdatePresenceModeDto {
  @IsEnum(CheckinPresenceMode)
  mode!: CheckinPresenceMode;
}

/**
 * El código rotativo que el negocio muestra en el mostrador.
 *
 * Ruta AUTENTICADA y scopeada al negocio activo — nunca pública. Si el
 * código se pudiera pedir sin sesión de panel, cualquiera lo obtendría desde
 * su casa y la prueba de presencia dejaría de probar nada. `TenantGuard`
 * garantiza que el `businessId` sale de la membership real, no de un header
 * elegido por el cliente.
 */
@Controller('checkin-presence')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class CheckinPresenceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceChallengeService,
  ) {}

  /** Estado + código vigente. Cualquier miembro activo puede mostrarlo. */
  @Get()
  async current(@Req() req: AuthenticatedRequest) {
    const businessId = req.currentBusinessId!;
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { checkinPresenceMode: true },
    });

    const mode = business?.checkinPresenceMode ?? CheckinPresenceMode.off;
    const enabled = mode === CheckinPresenceMode.rotating_code;

    return {
      mode,
      enabled,
      // `available: false` con `enabled: true` = el modo está prendido pero
      // el servidor no tiene secreto utilizable, así que el check-in NO está
      // pidiendo el código. Se dice en vez de mostrar un código inútil.
      available: this.presence.isRequired({ checkinPresenceMode: mode }),
      challenge: enabled ? this.presence.currentForPanel(businessId) : null,
    };
  }

  /** Prender/apagar la exigencia. Decisión del dueño, no de un operador. */
  @Patch('mode')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  async setMode(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdatePresenceModeDto,
  ) {
    await this.prisma.business.update({
      where: { id: req.currentBusinessId! },
      data: { checkinPresenceMode: dto.mode },
      select: { id: true },
    });
    return this.current(req);
  }
}
