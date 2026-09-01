import { Module } from '@nestjs/common';
import { JobsModule } from '../../jobs/jobs.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RewardGoalsModule } from '../reward-goals/reward-goals.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackRepository } from './feedback.repository';
import { FeedbackService } from './feedback.service';

@Module({
  // `RewardGoalsModule` da `RewardGoalFeedbackService`: el sello extra por
  // feedback interno lo otorga el MISMO servicio que la card del check-in,
  // así que no hay dos caminos posibles para dar el mismo sello.
  imports: [JobsModule, PrismaModule, RewardGoalsModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackRepository],
})
export class FeedbackModule {}
