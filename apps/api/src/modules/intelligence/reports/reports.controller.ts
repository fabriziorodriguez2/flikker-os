import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../../common/types/request.types';
import { INTELLIGENCE_CHAT_ROLES } from '../conversations.controller';
import { REPORT_EXPORT_ROLES, ReportsService } from './reports.service';

/**
 * Reportes generados por el agente. Misma política que las conversaciones:
 * guards a nivel de clase y cada reporte visible solo para quien lo generó.
 * Exportar (que saca datos del panel) queda para OWNER/ADMIN.
 */
@Controller('intelligence/reports')
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Roles(...INTELLIGENCE_CHAT_ROLES)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(':id')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.reports.get(scopeOf(req), id, req.currentMembershipRole!);
  }

  @Get(':id/export')
  @Roles(...REPORT_EXPORT_ROLES)
  async export(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('format') format: string,
  ) {
    const role = req.currentMembershipRole!;
    if (format === 'csv') {
      const file = await this.reports.exportCsv(scopeOf(req), id, role);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.filename}"`,
      );
      res.send(file.body);
      return;
    }
    if (format === 'pdf') {
      const file = await this.reports.exportPdf(scopeOf(req), id, role);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.filename}"`,
      );
      res.send(file.body);
      return;
    }
    throw new BadRequestException('format must be csv or pdf');
  }
}

function scopeOf(req: AuthenticatedRequest) {
  return { businessId: req.currentBusinessId!, userId: req.user.id };
}
