import { Module } from '@nestjs/common';
import { AuditService } from '../../../common/services/audit.service';
import { RetentionV2Module } from '../../retention-v2/retention-v2.module';
import { PolicyModule } from '../../policy/policy.module';
import { AiModule } from '../../ai/ai.module';
import { PlannerService } from '../plans/planner.service';
import { BusinessSnapshotService } from '../plans/business-snapshot.service';
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
  ],
  exports: [AutonomyService, AutonomyAdminService, PlannerService],
})
export class AutonomyModule {}
