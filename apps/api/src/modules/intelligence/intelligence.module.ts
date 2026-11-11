import { Module } from '@nestjs/common';
import { PolicyModule } from '../policy/policy.module';
import { AutonomyModule } from './autonomy/autonomy.module';
import { CostReportController } from './costs/cost-report.controller';
import { CostReportService } from './costs/cost-report.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { InsightsModule } from '../insights/insights.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { MissionsModule } from '../missions/missions.module';
import { RewardGoalsModule } from '../reward-goals/reward-goals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditService } from '../../common/services/audit.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { AgentService } from './agent/agent.service';
import { AgentToolsService } from './agent/agent-tools.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { ActionsController } from './actions/actions.controller';
import { ActionsService } from './actions/actions.service';
import { ActionHandlersService } from './actions/action-handlers.service';

/**
 * Intelligence compone lo que ya existe: el provider, gate y cuotas de IA
 * (`AiModule`), los read-models de `InsightsModule` y el motor de retención
 * (`RetentionV2Module`, para el diagnóstico de Autopilot y la segmentación de
 * los reportes). No define un segundo provider ni una segunda lógica de
 * métricas. Las acciones del agente escriben solo a través de los servicios
 * de dominio de Campañas, Beneficios, Misiones, Programa y Promociones.
 */
@Module({
  imports: [
    PrismaModule,
    AiModule,
    InsightsModule,
    RetentionV2Module,
    CampaignsModule,
    BenefitsModule,
    MissionsModule,
    RewardGoalsModule,
    NotificationsModule,
    // Cambios con impacto: política aceptada, sin pausa y costo estimable.
    PolicyModule,
    // "Actividad autónoma" para la herramienta de lectura del agente.
    AutonomyModule,
  ],
  controllers: [
    ConversationsController,
    ReportsController,
    ActionsController,
    CostReportController,
  ],
  providers: [
    CostReportService,
    ConversationsService,
    AgentService,
    AgentToolsService,
    ReportsService,
    ActionsService,
    ActionHandlersService,
    AuditService,
  ],
})
export class IntelligenceModule {}
