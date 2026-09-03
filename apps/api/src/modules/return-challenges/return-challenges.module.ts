import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ReturnChallengeService } from './return-challenge.service';
import { ReturnChallengeSweepService } from './return-challenge-sweep.service';

/**
 * Desafíos de vuelta (Fase 3 de gamificación) — CHECKIN_V2.
 *
 * Solo `PrismaModule`. No importa `RewardGoalsModule` a propósito: el sello se
 * escribe en `RewardGoalBonusStamp` dentro de la misma transacción que
 * completa el desafío, y meter un servicio ajeno adentro de esa transacción
 * sería justamente lo que rompe la atomicidad. Tampoco importa
 * `RetentionV2Module`: es Retention quien llama acá, no al revés.
 */
@Module({
  imports: [PrismaModule],
  providers: [ReturnChallengeService, ReturnChallengeSweepService],
  exports: [ReturnChallengeService, ReturnChallengeSweepService],
})
export class ReturnChallengesModule {}
