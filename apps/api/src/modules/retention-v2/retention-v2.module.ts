import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RetentionSettingsService } from './retention-settings.service';
import { RetentionExperimentService } from './retention-experiment.service';
import { RetentionAssignmentService } from './retention-assignment.service';
import { RetentionDecisionLogService } from './retention-decision-log.service';
import { RetentionBudgetService } from './retention-budget.service';
import { IncentiveIssuerService } from './incentive-issuer.service';
import { RetentionV2EvaluateService } from './retention-v2-evaluate.service';
import { RetentionV2SendService } from './retention-v2-send.service';
import { RetentionV2MessageDispatchService } from './retention-v2-message-dispatch.service';
import { RetentionSettingsController } from './retention-settings.controller';
import { RetentionIncentivesService } from './retention-incentives.service';
import { RetentionIncentivesController } from './retention-incentives.controller';
import { RetentionExperimentsAdminService } from './retention-experiments-admin.service';
import { RetentionExperimentsController } from './retention-experiments.controller';
import { RetentionDryRunReportService } from './retention-dry-run-report.service';
import { RetentionDryRunController } from './retention-dry-run.controller';
import { RetentionOutcomeService } from './retention-outcome.service';
import { RetentionExperimentMetricsService } from './retention-experiment-metrics.service';
import { RetentionResultsOverviewService } from './retention-results-overview.service';
import { RetentionResultsController } from './retention-results.controller';
import { AiModule } from '../ai/ai.module';
import { AiRecommendationExplanationService } from '../ai/recommendation-explanation.service';
import { RetentionOptimizationService } from './retention-optimization.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { RetentionV2BootstrapService } from './retention-v2-bootstrap.service';

/**
 * Retention Engine V2 runtime, plus the Fase C.5 configuration surface
 * (settings today; incentives and experiments CRUD join it in the same
 * module as they land). Workers still drive the engine itself — these
 * controllers only let the owner configure what the workers read.
 */
@Module({
  imports: [PrismaModule, AiModule],
  controllers: [
    RetentionSettingsController,
    RetentionIncentivesController,
    RetentionExperimentsController,
    RetentionDryRunController,
    RetentionResultsController,
  ],
  providers: [
    RetentionSettingsService,
    RetentionExperimentService,
    RetentionAssignmentService,
    RetentionDecisionLogService,
    RetentionBudgetService,
    IncentiveIssuerService,
    RetentionV2EvaluateService,
    RetentionV2SendService,
    // Provided here too (not imported from JobsModule) to avoid a circular
    // module dependency — JobsModule already imports RetentionV2Module for
    // the workers. WhatsAppBspService is stateless, so a second instance
    // costs nothing.
    WhatsAppBspService,
    RetentionV2MessageDispatchService,
    RetentionIncentivesService,
    RetentionExperimentsAdminService,
    RetentionV2BootstrapService,
    RetentionDryRunReportService,
    RetentionOutcomeService,
    RetentionExperimentMetricsService,
    RetentionResultsOverviewService,
    AiRecommendationExplanationService,
    RetentionOptimizationService,
  ],
  exports: [
    RetentionV2EvaluateService,
    RetentionV2SendService,
    RetentionV2MessageDispatchService,
    RetentionV2BootstrapService,
    RetentionExperimentService,
    RetentionOutcomeService,
    RetentionDecisionLogService,
    RetentionSettingsService,
    RetentionBudgetService,
    IncentiveIssuerService,
    AiRecommendationExplanationService,
    RetentionOptimizationService,
    // Dashboard principal (#new) — señal simple de Retención reutiliza el
    // mismo resumen por experimento que ya usa /retention-v2/results/overview,
    // en vez de recalcular winner/uplift por su cuenta.
    RetentionResultsOverviewService,
  ],
})
export class RetentionV2Module {}
