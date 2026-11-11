import { Module } from '@nestjs/common';
import { AuditService } from '../../common/services/audit.service';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { PolicyService } from './policy.service';
import { PolicyGateService } from './policy-gate.service';
import { ConsentService } from './consent.service';
import {
  ConsentController,
  PolicyController,
  PolicyPlatformController,
} from './policy.controller';

/**
 * Motor de políticas. No importa RetentionV2Module a propósito: Retention V2
 * (Autopilot) consume este módulo, y `RetentionSettingsService` solo depende
 * de Prisma, así que se provee acá directo para no armar un ciclo.
 */
@Module({
  controllers: [PolicyController, ConsentController, PolicyPlatformController],
  providers: [
    PolicyService,
    PolicyGateService,
    ConsentService,
    RetentionSettingsService,
    AuditService,
  ],
  exports: [PolicyService, PolicyGateService, ConsentService],
})
export class PolicyModule {}
