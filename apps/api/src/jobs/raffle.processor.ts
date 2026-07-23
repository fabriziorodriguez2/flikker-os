import { Injectable, Logger } from '@nestjs/common';
import { BenefitType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getLocalDateTimeParts,
  isLastDayOfMonthInTz,
  localPeriodKey,
} from '../common/utils/timezone.util';
import { RaffleQueue } from './raffle.queue';

const DEFAULT_TIMEZONE = 'America/Montevideo';
const DRAW_HOUR = 23;
const DRAW_MINUTE_FROM = 50;

interface ActiveRaffleBenefit {
  id: string;
  businessId: string;
  business: { timezone: string | null };
}

@Injectable()
export class RaffleProcessor {
  private readonly logger = new Logger(RaffleProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly raffleQueue: RaffleQueue,
  ) {}

  async runTick(now = new Date()) {
    const startedAt = Date.now();
    const benefits = await this.findActiveRaffleBenefits();
    let drawn = 0;

    for (const benefit of benefits) {
      const timezone = benefit.business.timezone || DEFAULT_TIMEZONE;
      if (!this.isDrawWindow(now, timezone)) continue;

      const periodKey = localPeriodKey(now, timezone);
      const alreadyDrawn = await this.prisma.raffleDraw.findUnique({
        where: { benefitId_periodKey: { benefitId: benefit.id, periodKey } },
        select: { id: true },
      });
      if (alreadyDrawn) continue;

      const drawId = await this.drawWinner(
        benefit.id,
        benefit.businessId,
        periodKey,
        now,
      );
      if (!drawId) continue; // No participants this period — nothing to draw.

      await this.raffleQueue.enqueueSendRaffleNotifications({ drawId });
      drawn += 1;
    }

    const ms = Date.now() - startedAt;
    this.logger.log(
      `Raffle tick drawn=${drawn} checked=${benefits.length} ${ms}ms`,
    );
    return { drawn, checked: benefits.length, ms };
  }

  private findActiveRaffleBenefits(): Promise<ActiveRaffleBenefit[]> {
    return this.prisma.benefit.findMany({
      where: { type: BenefitType.raffle, active: true },
      select: {
        id: true,
        businessId: true,
        business: { select: { timezone: true } },
      },
    });
  }

  private isDrawWindow(now: Date, timezone: string): boolean {
    if (!isLastDayOfMonthInTz(now, timezone)) return false;
    const { hour, minute } = getLocalDateTimeParts(now, timezone);
    return hour === DRAW_HOUR && minute >= DRAW_MINUTE_FROM;
  }

  /**
   * Picks a random winner from the currently open cycle and closes it —
   * stamping every open participation with the new draw's id, which is what
   * makes next month's participant list start out empty. Returns the new
   * draw's id, or null when there were no participants to draw from.
   */
  private async drawWinner(
    benefitId: string,
    businessId: string,
    periodKey: string,
    now: Date,
  ): Promise<string | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const openParticipations = await tx.benefitParticipation.findMany({
          where: { benefitId, raffleDrawId: null },
          select: { id: true, customerId: true },
        });
        if (openParticipations.length === 0) return null;

        const winner =
          openParticipations[
            Math.floor(Math.random() * openParticipations.length)
          ];

        const draw = await tx.raffleDraw.create({
          data: {
            benefitId,
            businessId,
            periodKey,
            winnerCustomerId: winner.customerId,
            participantsCount: openParticipations.length,
            drawnAt: now,
          },
        });

        await tx.benefitParticipation.updateMany({
          where: { benefitId, raffleDrawId: null },
          data: { raffleDrawId: draw.id },
        });

        return draw.id;
      });
    } catch (error) {
      // Unique (benefitId, periodKey) race: another tick already drew this period.
      this.logger.warn(
        `Raffle draw skipped for benefit ${benefitId} period ${periodKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
