import { Injectable, Logger } from '@nestjs/common';
import { ReturnChallengeStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReturnChallengeExpiryResult {
  expired: number;
}

/**
 * Barrido diario de desafíos de vuelta — la red de seguridad, no el mecanismo
 * principal.
 *
 * `ReturnChallengeService.completeForVisit` ya revalida el deadline en runtime
 * contra el instante de la visita, así que un desafío vencido nunca otorga un
 * sello aunque este barrido todavía no haya corrido. Esto solo pone el estado
 * al día para el historial y para que Mi Flikker no dependa de un filtro por
 * fecha en cada lectura.
 */
@Injectable()
export class ReturnChallengeSweepService {
  private readonly logger = new Logger(ReturnChallengeSweepService.name);

  constructor(private readonly prisma: PrismaService) {}

  async expireOverdue(
    now: Date = new Date(),
  ): Promise<ReturnChallengeExpiryResult> {
    // `status` en el `where` es la protección: un desafío COMPLETED o
    // CANCELLED no puede pasar a EXPIRED por un barrido posterior.
    const expired = await this.prisma.returnChallenge.updateMany({
      where: {
        status: ReturnChallengeStatus.ACTIVE,
        expiresAt: { lte: now },
      },
      data: { status: ReturnChallengeStatus.EXPIRED },
    });

    if (expired.count > 0) {
      this.logger.log(`Desafíos de vuelta vencidos=${expired.count}`);
    }
    return { expired: expired.count };
  }
}
