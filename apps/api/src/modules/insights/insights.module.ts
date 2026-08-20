import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { CustomersModule } from '../customers/customers.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { RewardGoalsModule } from '../reward-goals/reward-goals.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { InsightsController } from './insights.controller';
import { ChatbotController } from './chatbot.controller';
import { InsightsRepository } from './insights.repository';
import { InsightsService } from './insights.service';
import { BusinessInsightSummaryService } from './business-insight-summary.service';
import { ChatbotService } from './chatbot.service';

/**
 * Insights (CHECKIN_V2) — no reimplementa ninguna métrica que ya exista:
 * compone `CustomersModule` (segmentación/fidelización), `ReviewsModule`,
 * `RewardGoalsModule` (sellos/recompensas) y `RetentionV2Module`
 * (reactivaciones). `AiModule` da el gate/cap/provider genéricos que ya
 * existían — el resumen IA y el chatbot solo agregan sus use cases nuevos
 * sobre esa misma infraestructura.
 */
@Module({
  imports: [
    PrismaModule,
    AiModule,
    CustomersModule,
    ReviewsModule,
    RewardGoalsModule,
    RetentionV2Module,
  ],
  controllers: [InsightsController, ChatbotController],
  providers: [
    InsightsRepository,
    InsightsService,
    BusinessInsightSummaryService,
    ChatbotService,
  ],
  exports: [InsightsService],
})
export class InsightsModule {}
