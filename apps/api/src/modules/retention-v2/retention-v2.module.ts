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

/**
 * Retention Engine V2 runtime, plus the Fase C.5 configuration surface
 * (settings today; incentives and experiments CRUD join it in the same
 * module as they land). Workers still drive the engine itself — these
 * controllers only let the owner configure what the workers read.
 */
@Module({
  imports: [PrismaModule],
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
    RetentionIncentivesService,
    RetentionExperimentsAdminService,
    RetentionDryRunReportService,
    RetentionOutcomeService,
    RetentionExperimentMetricsService,
    RetentionResultsOverviewService,
  ],
  exports: [
    RetentionV2EvaluateService,
    RetentionV2SendService,
    RetentionOutcomeService,
    RetentionDecisionLogService,
    RetentionSettingsService,
    IncentiveIssuerService,
  ],
})
export class RetentionV2Module {}
