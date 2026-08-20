import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { ProgramAuditModule } from '../program-audit/program-audit.module';
import { PlansModule } from '../plans/plans.module';
import { LifecycleEmailsService } from '../../jobs/lifecycle-emails.service';
import { AutomationCooldownService } from '../../jobs/automation-cooldown.service';
import { EmailService } from '../../jobs/email.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { RewardGoalEngineService } from './reward-goal-engine.service';
import { RewardGoalIssuerService } from './reward-goal-issuer.service';
import { RewardGoalUnlockService } from './reward-goal-unlock.service';
import { RewardGoalUnlockNotificationService } from './reward-goal-unlock-notification.service';
import { RewardGoalOrchestratorService } from './reward-goal-orchestrator.service';
import { RewardGoalSweepService } from './reward-goal-sweep.service';
import { RewardGoalFeedbackService } from './reward-goal-feedback.service';
import { LoyaltyProgramService } from './loyalty-program.service';
import { LoyaltyProgramController } from './loyalty-program.controller';

/**
 * Reward Goals (Fase E). Imports `RetentionV2Module` for its shared
 * decision-log/settings services and pure segmentation helpers — never
 * duplicating that logic, per Fase E §1/§24.
 *
 * `LifecycleEmailsService`/`AutomationCooldownService`/`EmailService`/
 * `WhatsAppBspService` se declaran acá TAMBIÉN como providers propios
 * (instancia separada de la que usa `JobsModule`) en vez de importar
 * `JobsModule` — `JobsModule` ya importa `RewardGoalsModule` (para
 * `RewardGoalWorker`), así que el import inverso sería circular. Mismo
 * patrón que ya usa `RetentionV2Module` con estos mismos dos servicios: no
 * tienen estado en memoria que dependa de ser singleton — la idempotencia
 * la da el índice único de `EmailLog`/`CustomerAutomationContact` en la DB.
 */
@Module({
  imports: [
    PrismaModule,
    RetentionV2Module,
    BenefitsModule,
    ProgramAuditModule,
    PlansModule,
  ],
  controllers: [LoyaltyProgramController],
  providers: [
    LoyaltyProgramService,
    RewardGoalEngineService,
    RewardGoalIssuerService,
    RewardGoalUnlockService,
    RewardGoalUnlockNotificationService,
    RewardGoalOrchestratorService,
    RewardGoalSweepService,
    RewardGoalFeedbackService,
    LifecycleEmailsService,
    AutomationCooldownService,
    EmailService,
    WhatsAppBspService,
  ],
  exports: [
    RewardGoalEngineService,
    RewardGoalIssuerService,
    RewardGoalUnlockService,
    RewardGoalOrchestratorService,
    RewardGoalSweepService,
    RewardGoalFeedbackService,
    LoyaltyProgramService,
  ],
})
export class RewardGoalsModule {}
