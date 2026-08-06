import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CheckinMetricsController } from './checkin-metrics.controller';
import { CheckinMetricsService } from './checkin-metrics.service';
import { CheckinsController } from './checkins.controller';
import { CheckinsService } from './checkins.service';

@Module({
  imports: [PrismaModule],
  controllers: [CheckinMetricsController, CheckinsController],
  providers: [CheckinMetricsService, CheckinsService],
})
export class CheckinMetricsModule {}
