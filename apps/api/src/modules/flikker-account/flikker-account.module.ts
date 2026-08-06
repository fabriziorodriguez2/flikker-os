import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PublicModule } from '../public/public.module';
import { RewardGoalsModule } from '../reward-goals/reward-goals.module';
import { FlikkerAccountController } from './flikker-account.controller';
import { FlikkerAccountService } from './flikker-account.service';
import { FlikkerAccountSessionsRepository } from './flikker-account-sessions.repository';
import { FlikkerAccountVerificationsRepository } from './flikker-account-verifications.repository';
import { MyFlikkerController } from './my-flikker.controller';
import { MyFlikkerService } from './my-flikker.service';

@Module({
  imports: [PrismaModule, PublicModule, RewardGoalsModule],
  controllers: [FlikkerAccountController, MyFlikkerController],
  providers: [
    FlikkerAccountService,
    FlikkerAccountSessionsRepository,
    FlikkerAccountVerificationsRepository,
    MyFlikkerService,
  ],
  exports: [FlikkerAccountService, FlikkerAccountSessionsRepository],
})
export class FlikkerAccountModule {}
