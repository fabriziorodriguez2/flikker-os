import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { MissionsController } from './missions.controller';
import { MissionProgressService } from './mission-progress.service';
import { MissionService } from './mission.service';
import { MissionSweepService } from './mission-sweep.service';

/**
 * Misiones (Fase 1 de gamificación) — CHECKIN_V2.
 *
 * `BenefitsModule` da `BenefitsRepository`, con el que se emite el premio.
 * No se importa ni `RewardGoalsModule` ni `RetentionV2Module`: las misiones no
 * dan sellos, no reclutan a nadie y no mandan mensajes. Son un contador
 * derivado de `Visit` y una emisión de beneficio, nada más.
 */
@Module({
  imports: [PrismaModule, BenefitsModule],
  controllers: [MissionsController],
  providers: [MissionService, MissionProgressService, MissionSweepService],
  exports: [MissionProgressService, MissionSweepService],
})
export class MissionsModule {}
