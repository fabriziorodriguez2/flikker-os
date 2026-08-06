import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { PublicModule } from '../public/public.module';
import { VisitSourcesModule } from '../visit-sources/visit-sources.module';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';
import { VisitsRepository } from './visits.repository';
import { CustomerSessionsRepository } from './customer-sessions.repository';
import { CustomerVerificationsRepository } from './customer-verifications.repository';
import { CustomerEventsRepository } from './customer-events.repository';

@Module({
  imports: [PrismaModule, BenefitsModule, PublicModule, VisitSourcesModule],
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
