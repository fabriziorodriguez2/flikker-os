import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { MessageChannel, MessageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RetentionQueue } from './retention.queue';

interface RetentionStepRow {
  id: string;
  offsetDays: number;
}

@Injectable()
export class RetentionProcessor {
  private readonly logger = new Logger(RetentionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly retentionQueue: RetentionQueue,
  ) {}

  async runDaily(now = new Date()) {
    const startedAt = Date.now();
    const sequences = await this.findEnabledSequences();
    let queued = 0;

    for (const sequence of sequences) {
      for (const step of sequence.steps) {
        const customerIds = await this.findCandidateCustomerIds(
          sequence.businessId,
          step.offsetDays,
          now,
        );

        for (const customerId of customerIds) {
          const send = await this.createQueuedSend(
            sequence.businessId,
            customerId,
            step,
          );
          if (!send) continue;
          await this.retentionQueue.enqueueSendRetentionMessage({
            retentionSendId: send.id,
          });
          queued += 1;
        }
      }
    }

    const ms = Date.now() - startedAt;
    this.logger.log(
      `Retention daily run queued=${queued} sequences=${sequences.length} ${ms}ms`,
    );
    return { queued, sequences: sequences.length, ms };
  }

  private findEnabledSequences() {
    return this.prisma.retentionSequence.findMany({
      where: { enabled: true },
      select: {
        businessId: true,
        steps: { select: { id: true, offsetDays: true } },
      },
    });
  }

  /**
   * Customers registered exactly `offsetDays` ago (calendar day) who are still
   * active, opted in, and have not yet received the message for this offset.
   */
  private async findCandidateCustomerIds(
    businessId: string,
    offsetDays: number,
    now: Date,
  ) {
    const start = this.startOfDay(this.daysAgo(now, offsetDays));
    const end = this.addDays(start, 1);

    const rows = await this.prisma.customer.findMany({
      where: {
        businessId,
        isActive: true,
        optedOut: false,
        createdAt: { gte: start, lt: end },
        retentionSends: { none: { offsetDays } },
      },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  /**
   * Creates the Message + RetentionSend pair atomically. Returns null when a
   * concurrent run already created the send (unique (customerId, offsetDays)).
   */
  private async createQueuedSend(
    businessId: string,
    customerId: string,
    step: RetentionStepRow,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            businessId,
            customerId,
            channel: MessageChannel.whatsapp,
            trackingToken: randomBytes(8).toString('base64url'),
            status: MessageStatus.queued,
          },
        });

        return tx.retentionSend.create({
          data: {
            businessId,
            customerId,
            stepId: step.id,
            offsetDays: step.offsetDays,
            messageId: message.id,
            status: MessageStatus.queued,
          },
        });
      });
    } catch (error) {
      this.logger.warn(
        `Retention send skipped for customer ${customerId} offset ${step.offsetDays}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private daysAgo(date: Date, days: number) {
    return this.addDays(date, -days);
  }
}
