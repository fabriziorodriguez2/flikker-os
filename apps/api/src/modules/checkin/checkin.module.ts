import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { PublicModule } from '../public/public.module';
import { VisitSourcesModule } from '../visit-sources/visit-sources.module';
import { RewardGoalsModule } from '../reward-goals/reward-goals.module';
import { MissionsModule } from '../missions/missions.module';
import { ReturnChallengesModule } from '../return-challenges/return-challenges.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { FlikkerAccountModule } from '../flikker-account/flikker-account.module';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';
import { CheckinPresenceController } from './presence.controller';
import { PresenceChallengeService } from './presence-challenge.service';
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
    MissionsModule,
    ReturnChallengesModule,
    RetentionV2Module,
    FlikkerAccountModule,
  ],
  controllers: [
    CheckinController,
    CheckinPresenceController,
    RedemptionController,
  ],
  providers: [
    CheckinService,
    PresenceChallengeService,
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
