import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RetentionV2Module } from '../modules/retention-v2/retention-v2.module';
import { RewardGoalsModule } from '../modules/reward-goals/reward-goals.module';
import { PlansModule } from '../modules/plans/plans.module';
import { AiModule } from '../modules/ai/ai.module';
import { CustomersModule } from '../modules/customers/customers.module';
import { BenefitsModule } from '../modules/benefits/benefits.module';
import { InsightsRepository } from '../modules/insights/insights.repository';
import { OwnerLifecycleAiSummaryService } from '../modules/insights/owner-lifecycle-ai-summary.service';
import { BusinessImpactService } from '../modules/insights/business-impact.service';
import { OwnerNotificationsQueue } from './owner-notifications.queue';
import { GoogleReviewDetectionQueue } from './google-review-detection.queue';
import { GoogleReviewsProvider } from './google-reviews.provider';
import { GooglePlacesProvider } from './google-places.provider';
import { RepeatsQueue } from './repeats.queue';
import { RetentionQueue } from './retention.queue';
import { RetentionV2Queue } from './retention-v2.queue';
import { RaffleQueue } from './raffle.queue';
import { ReviewRequestQueue } from './review-request.queue';
import { WhatsAppInboundQueue } from './whatsapp-inbound.queue';
import { GoogleCalendarSyncQueue } from './google-calendar-sync.queue';
import { GoogleCalendarSendCheckQueue } from './google-calendar-send-check.queue';
import { GoogleReviewDetectionWorker } from './workers/google-review-detection.worker';
import { WhatsAppInboundWorker } from './workers/whatsapp-inbound.worker';
import { OwnerNotificationsWorker } from './workers/owner-notifications.worker';
import { RepeatsWorker } from './workers/repeats.worker';
import { RetentionWorker } from './workers/retention.worker';
import { RetentionV2Worker } from './workers/retention-v2.worker';
import { RewardGoalQueue } from './reward-goal.queue';
import { RewardGoalWorker } from './workers/reward-goal.worker';
import { RetentionOptimizationQueue } from './retention-optimization.queue';
import { RetentionOptimizationWorker } from './workers/retention-optimization.worker';
import { RaffleWorker } from './workers/raffle.worker';
import { ReviewRequestWorker } from './workers/review-request.worker';
import { WhatsAppBspService } from './whatsapp-bsp.service';
import { EmailService } from './email.service';
import { RepeatsProcessor } from './repeats.processor';
import { RetentionProcessor } from './retention.processor';
import { RaffleProcessor } from './raffle.processor';
import { LifecycleEmailsService } from './lifecycle-emails.service';
import { LifecycleEmailsQueue } from './lifecycle-emails.queue';
import { LifecycleEmailsWorker } from './workers/lifecycle-emails.worker';
import { StampsExpiryEmailService } from './stamps-expiry-email.service';
import { BirthdayEmailService } from './birthday-email.service';
import { AutomationCooldownService } from './automation-cooldown.service';
import { OwnerLifecycleEmailLogService } from './owner-lifecycle-email-log.service';
import { OwnerLifecycleEmailsService } from './owner-lifecycle-emails.service';
import { OwnerLifecycleEmailsQueue } from './owner-lifecycle-emails.queue';
import { OwnerLifecycleEmailsWorker } from './workers/owner-lifecycle-emails.worker';
import { OwnerMilestoneWhatsAppService } from './owner-milestone-whatsapp.service';

@Module({
  imports: [
    PrismaModule,
    RetentionV2Module,
    RewardGoalsModule,
    PlansModule,
    // Deliberadamente NO `InsightsModule` — ese módulo importa
    // `ReviewsModule`, que (vía `CampaignsModule`) importa este mismo
    // `JobsModule`, cerrando un ciclo real de módulos. `InsightsRepository`,
    // `OwnerLifecycleAiSummaryService` y `BusinessImpactService` solo
    // necesitan módulos que ya no ciclan (`PrismaModule`, `AiModule`,
    // `CustomersModule`, `BenefitsModule`, `RewardGoalsModule`,
    // `RetentionV2Module` — verificado ninguno importa `JobsModule`), así
    // que se registran directo como providers propios en vez de importar
    // el módulo completo.
    AiModule,
    CustomersModule,
    BenefitsModule,
  ],
  providers: [
    ReviewRequestQueue,
    RepeatsQueue,
    RetentionQueue,
    RetentionV2Queue,
    RewardGoalQueue,
    RetentionOptimizationQueue,
    RaffleQueue,
    GoogleReviewDetectionQueue,
    OwnerNotificationsQueue,
    WhatsAppInboundQueue,
    GoogleCalendarSyncQueue,
    GoogleCalendarSendCheckQueue,
    GoogleReviewsProvider,
    GooglePlacesProvider,
    OwnerNotificationsWorker,
    GoogleReviewDetectionWorker,
    RepeatsProcessor,
    RepeatsWorker,
    RetentionProcessor,
    RetentionWorker,
    RetentionV2Worker,
    RewardGoalWorker,
    RetentionOptimizationWorker,
    RaffleProcessor,
    RaffleWorker,
    WhatsAppInboundWorker,
    ReviewRequestWorker,
    WhatsAppBspService,
    EmailService,
    LifecycleEmailsService,
    LifecycleEmailsQueue,
    LifecycleEmailsWorker,
    StampsExpiryEmailService,
    BirthdayEmailService,
    AutomationCooldownService,
    OwnerLifecycleEmailLogService,
    OwnerLifecycleEmailsService,
    OwnerLifecycleEmailsQueue,
    OwnerLifecycleEmailsWorker,
    OwnerMilestoneWhatsAppService,
    InsightsRepository,
    OwnerLifecycleAiSummaryService,
    BusinessImpactService,
  ],
  exports: [
    ReviewRequestQueue,
    WhatsAppInboundQueue,
    OwnerNotificationsQueue,
    GoogleReviewDetectionQueue,
    GoogleCalendarSyncQueue,
    GoogleCalendarSendCheckQueue,
    GoogleReviewsProvider,
    GooglePlacesProvider,
    WhatsAppBspService,
    EmailService,
  ],
})
export class JobsModule {}
