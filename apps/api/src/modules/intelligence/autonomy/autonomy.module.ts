import { Module } from '@nestjs/common';
import { AuditService } from '../../../common/services/audit.service';
import { RetentionV2Module } from '../../retention-v2/retention-v2.module';
import { PolicyModule } from '../../policy/policy.module';
import { AiModule } from '../../ai/ai.module';
import { PlannerService } from '../plans/planner.service';
import { BusinessSnapshotService } from '../plans/business-snapshot.service';
import { PlanExecutorService } from '../plans/plan-executor.service';
import { PlanMeasurementService } from '../plans/plan-measurement.service';
import { PlanControlService } from '../plans/plan-control.service';
import { AutonomyService } from './autonomy.service';
import { AutonomyAdminService } from './autonomy-admin.service';
import {
  AutonomyController,
  AutonomyPlatformController,
} from './autonomy.controller';

/**
 * Modo autónomo de Intelligence. Módulo propio (no dentro de
 * IntelligenceModule) porque lo consume el worker de Retention V2 en
 * JobsModule: así JobsModule no arrastra todo el chat.
 */
@Module({
  imports: [RetentionV2Module, PolicyModule, AiModule],
  controllers: [AutonomyController, AutonomyPlatformController],
  providers: [
    AutonomyService,
    AutonomyAdminService,
    AuditService,
    // Planificador con IA (simulación).
    PlannerService,
    BusinessSnapshotService,
    PlanExecutorService,
    PlanMeasurementService,
    PlanControlService,
  ],
  exports: [
    AutonomyService,
    AutonomyAdminService,
    PlannerService,
    PlanMeasurementService,
  ],
})
export class AutonomyModule {}
