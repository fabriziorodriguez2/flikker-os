import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { PublicModule } from '../public/public.module';
import { VisitSourcesModule } from '../visit-sources/visit-sources.module';
import { RewardGoalsModule } from '../reward-goals/reward-goals.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';
import { VisitsRepository } from './visits.repository';
import { CustomerSessionsRepository } from './customer-sessions.repository';
import { CustomerVerificationsRepository } from './customer-verifications.repository';
import { CustomerEventsRepository } from './customer-events.repository';

@Module({
  imports: [
    PrismaModule,
    BenefitsModule,
    PublicModule,
    VisitSourcesModule,
    RewardGoalsModule,
    RetentionV2Module,
  ],
  controllers: [CheckinController, RedemptionController],
  providers: [
    CheckinService,
    RedemptionService,
    VisitsRepository,
    CustomerSessionsRepository,
    CustomerVerificationsRepository,
    CustomerEventsRepository,
  ],
  exports: [
    VisitsRepository,
    CustomerSessionsRepository,
    CustomerEventsRepository,
  ],
})
export class CheckinModule {}
