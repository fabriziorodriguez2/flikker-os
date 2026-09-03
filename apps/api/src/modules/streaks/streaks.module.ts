import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StreakService } from './streak.service';

/**
 * Rachas (Fase 2 de gamificación) — CHECKIN_V2.
 *
 * Solo `PrismaModule`: una racha es una lectura sobre `Visit` y nada más. No
 * hay tabla propia, ni worker, ni emisión de nada — por eso este módulo no
 * importa Beneficios, Reward Goals ni Retention V2.
 */
@Module({
  imports: [PrismaModule],
  providers: [StreakService],
  exports: [StreakService],
})
export class StreaksModule {}
