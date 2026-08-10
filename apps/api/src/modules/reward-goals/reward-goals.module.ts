import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { RewardGoalEngineService } from './reward-goal-engine.service';
import { RewardGoalIssuerService } from './reward-goal-issuer.service';
import { RewardGoalUnlockService } from './reward-goal-unlock.service';
import { RewardGoalOrchestratorService } from './reward-goal-orchestrator.service';
import { RewardGoalSweepService } from './reward-goal-sweep.service';
import { RewardGoalFeedbackService } from './reward-goal-feedback.service';

/**
 * Reward Goals (Fase E). Imports `RetentionV2Module` for its shared
 * decision-log/settings services and pure segmentation helpers — never
 * duplicating that logic, per Fase E §1/§24.
 */
@Module({
  imports: [PrismaModule, RetentionV2Module],
  providers: [
    RewardGoalEngineService,
    RewardGoalIssuerService,
    RewardGoalUnlockService,
    RewardGoalOrchestratorService,
    RewardGoalSweepService,
    RewardGoalFeedbackService,
  ],
  exports: [
    RewardGoalEngineService,
    RewardGoalIssuerService,
    RewardGoalUnlockService,
    RewardGoalOrchestratorService,
    RewardGoalSweepService,
    RewardGoalFeedbackService,
  ],
})
export class RewardGoalsModule {}
