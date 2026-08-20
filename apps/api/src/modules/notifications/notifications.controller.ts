import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
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
import { NotificationsService } from './notifications.service';
import {
  NotificationsPromotionsService,
  type PromotionAudience,
} from './notifications-promotions.service';
import { UpdateAutomationsDto } from './dto/update-automations.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { SendPromotionDto } from './dto/send-promotion.dto';

/**
 * Notificaciones. Fachada de producto: no agrega dominio, traduce el que ya
 * existe.
 *
 * `CheckinV2Guard` (que responde 404, no 403) mantiene la sección invisible
 * para negocios LEGACY, igual que el resto de Retention V2. Esos negocios
 * siguen usando `/dashboard/campaigns` tal como hoy.
 *
 * Permisos: leer es de cualquier miembro; configurar automatizaciones es de
 * OWNER/ADMIN. Enviar promociones mantiene la política que ya tenía el envío
 * manual (`POST /campaigns/manual`), que incluye OPERATOR — no se amplía ni
 * se recorta acá.
 */
@Controller('notifications')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly promotions: NotificationsPromotionsService,
  ) {}

  @Get('overview')
  overview(@Req() req: AuthenticatedRequest) {
    return this.notifications.overview(req.currentBusinessId!);
  }

  @Get('history')
  history(@Req() req: AuthenticatedRequest) {
    return this.notifications.history(req.currentBusinessId!);
  }

  /** Resumen IA de "X contactados → Y volvieron → Z%" — cacheado. */
  @Get('reactivation-funnel/summary')
  reactivationFunnelSummary(@Req() req: AuthenticatedRequest) {
    return this.notifications.reactivationFunnelSummaryView(
      req.currentBusinessId!,
    );
  }

  /** Botón "Actualizar análisis" de ese resumen. */
  @Post('reactivation-funnel/summary/refresh')
  refreshReactivationFunnelSummary(@Req() req: AuthenticatedRequest) {
    return this.notifications.refreshReactivationFunnelSummary(
      req.currentBusinessId!,
    );
  }

  @Get('settings')
  settings(@Req() req: AuthenticatedRequest) {
    return this.notifications.settings(req.currentBusinessId!);
  }

  @Patch('automations')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  updateAutomations(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateAutomationsDto,
  ) {
    return this.notifications.updateAutomations(
      req.currentBusinessId!,
      dto,
      req.user.id,
    );
  }

  @Patch('settings')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notifications.updateSettings(req.currentBusinessId!, dto);
  }

  /** Cuántos clientes recibirían la promoción. Se muestra antes de enviar. */
  @Get('promotions/preview')
  preview(
    @Req() req: AuthenticatedRequest,
    @Query('audience') audience: PromotionAudience,
  ) {
    return this.promotions.preview(req.currentBusinessId!, audience);
  }

  @Post('promotions')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  sendPromotion(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SendPromotionDto,
  ) {
    return this.promotions.send(req.currentBusinessId!, req.user.id, dto);
  }
}
