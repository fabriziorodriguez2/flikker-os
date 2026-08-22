import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { CheckinMetricsController } from './checkin-metrics.controller';
import { CheckinMetricsService } from './checkin-metrics.service';
import { CheckinsController } from './checkins.controller';
import { CheckinsService } from './checkins.service';

@Module({
  imports: [PrismaModule, BenefitsModule],
  controllers: [CheckinMetricsController, CheckinsController],
  providers: [CheckinMetricsService, CheckinsService],
})
export class CheckinMetricsModule {}
