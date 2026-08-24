import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { MetricsModule } from '../metrics/metrics.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { DashboardController } from './dashboard.controller';
import { DashboardOverviewService } from './dashboard-overview.service';

@Module({
  imports: [
    PrismaModule,
    MetricsModule,
    ReviewsModule,
    RetentionV2Module,
    // Para reusar la semántica única de "Benefit canjeado"
    // (`BenefitsRepository.countRedeemed`/`findRecentRedemptions`) en vez de
    // que este dashboard arme su propia query.
    BenefitsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardOverviewService],
})
export class DashboardModule {}
