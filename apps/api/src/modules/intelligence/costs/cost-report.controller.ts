import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { CostReportService } from './cost-report.service';

export class CostReportQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @IsOptional()
  @IsUUID()
  businessId?: string;
}

/**
 * Costo de Intelligence por negocio (IA, mensajería y recompensas, sin
 * mezclar monedas). Cruza negocios, así que es solo de Platform Admin.
 */
@Controller('platform/intelligence')
@UseGuards(JwtGuard, PlatformAdminGuard)
export class CostReportController {
  constructor(private readonly costs: CostReportService) {}

  @Get('costs')
  report(@Query() query: CostReportQueryDto) {
    return this.costs.report(query);
  }
}
