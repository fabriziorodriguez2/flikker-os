import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { BusinessesModule } from './modules/businesses/businesses.module';
import { BranchesModule } from './modules/branches/branches.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { PlansModule } from './modules/plans/plans.module';
import { PlatformModule } from './modules/platform/platform.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { QrCodesModule } from './modules/qr-codes/qr-codes.module';
import { RedirectsModule } from './modules/redirects/redirects.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ResponsesModule } from './modules/responses/responses.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { WidgetsModule } from './modules/widgets/widgets.module';
import { CustomersModule } from './modules/customers/customers.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { ServiceEventsModule } from './modules/service-events/service-events.module';
import { BusinessGoalsModule } from './modules/business-goals/business-goals.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { TestLabModule } from './modules/test-lab/test-lab.module';
import { ShopifyIntegrationModule } from './modules/integrations/shopify/shopify-integration.module';
import { GoogleCalendarModule } from './modules/integrations/google-calendar/google-calendar.module';
import { PublicModule } from './modules/public/public.module';
import { MessageTemplatesModule } from './modules/message-templates/message-templates.module';
import { BenefitsModule } from './modules/benefits/benefits.module';
import { RetentionModule } from './modules/retention/retention.module';
import { VisitSourcesModule } from './modules/visit-sources/visit-sources.module';
import { CheckinModule } from './modules/checkin/checkin.module';
import { CheckinMetricsModule } from './modules/checkin-metrics/checkin-metrics.module';
import { FlikkerAccountModule } from './modules/flikker-account/flikker-account.module';
import { RewardGoalsModule } from './modules/reward-goals/reward-goals.module';
import { SimulationModule } from './modules/simulation/simulation.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    AuthModule,
    BusinessesModule,
    BranchesModule,
    MembershipsModule,
    PlansModule,
    PlatformModule,
    CampaignsModule,
    QrCodesModule,
    RedirectsModule,
    ReviewsModule,
    ResponsesModule,
    MetricsModule,
    WidgetsModule,
    CustomersModule,
    FeedbackModule,
    ServiceEventsModule,
    BusinessGoalsModule,
    WebhooksModule,
    JobsModule,
    TestLabModule,
    ShopifyIntegrationModule,
    GoogleCalendarModule,
    PublicModule,
    MessageTemplatesModule,
    BenefitsModule,
    RetentionModule,
    VisitSourcesModule,
    CheckinModule,
    CheckinMetricsModule,
    FlikkerAccountModule,
    RewardGoalsModule,
    SimulationModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
