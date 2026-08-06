import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RetentionV2Module } from '../modules/retention-v2/retention-v2.module';
import { RewardGoalsModule } from '../modules/reward-goals/reward-goals.module';
import { OwnerNotificationsQueue } from './owner-notifications.queue';
import { GoogleReviewDetectionQueue } from './google-review-detection.queue';
import { GoogleReviewsProvider } from './google-reviews.provider';
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
import { RaffleWorker } from './workers/raffle.worker';
import { ReviewRequestWorker } from './workers/review-request.worker';
import { WhatsAppBspService } from './whatsapp-bsp.service';
import { EmailService } from './email.service';
import { RepeatsProcessor } from './repeats.processor';
import { RetentionProcessor } from './retention.processor';
import { RaffleProcessor } from './raffle.processor';

@Module({
  imports: [PrismaModule, RetentionV2Module, RewardGoalsModule],
  providers: [
    ReviewRequestQueue,
    RepeatsQueue,
    RetentionQueue,
    RetentionV2Queue,
    RewardGoalQueue,
    RaffleQueue,
    GoogleReviewDetectionQueue,
    OwnerNotificationsQueue,
    WhatsAppInboundQueue,
    GoogleCalendarSyncQueue,
    GoogleCalendarSendCheckQueue,
    GoogleReviewsProvider,
    OwnerNotificationsWorker,
    GoogleReviewDetectionWorker,
    RepeatsProcessor,
    RepeatsWorker,
    RetentionProcessor,
    RetentionWorker,
    RetentionV2Worker,
    RewardGoalWorker,
    RaffleProcessor,
    RaffleWorker,
    WhatsAppInboundWorker,
    ReviewRequestWorker,
    WhatsAppBspService,
    EmailService,
  ],
  exports: [
    ReviewRequestQueue,
    WhatsAppInboundQueue,
    OwnerNotificationsQueue,
    GoogleReviewDetectionQueue,
    GoogleCalendarSyncQueue,
    GoogleCalendarSendCheckQueue,
    GoogleReviewsProvider,
    WhatsAppBspService,
    EmailService,
  ],
})
export class JobsModule {}
