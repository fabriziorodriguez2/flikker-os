import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiConfigService } from './ai-config.service';
import { OpenAiProviderService } from './openai-provider.service';
import { AiUsageService } from './ai-usage.service';
import { AiGateService } from './ai-gate.service';
import { RetentionAiCopyService } from './retention-ai-copy.service';
import { AI_PROVIDER } from './ai-provider.interface';
import { AiUsageController } from './ai-usage.controller';

/**
 * Fase F — the generic AI plumbing: provider, config, gate, usage tracking,
 * and the one message-copy service (Fase F §9) that needs nothing beyond
 * these. Deliberately does NOT import RetentionV2Module — that would create
 * a cycle, since RetentionV2Module is the one that needs THIS module (for
 * RetentionAiCopyService in its send service). AiRecommendationExplanationService
 * — the one AI piece that DOES need RetentionExperimentMetricsService — is
 * registered inside RetentionV2Module itself instead, even though its file
 * lives here; Nest module membership is independent of file location.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AiUsageController],
  providers: [
    AiConfigService,
    { provide: AI_PROVIDER, useClass: OpenAiProviderService },
    AiUsageService,
    AiGateService,
    RetentionAiCopyService,
  ],
  exports: [
    AiConfigService,
    AiUsageService,
    AiGateService,
    RetentionAiCopyService,
    AI_PROVIDER,
  ],
})
export class AiModule {}
