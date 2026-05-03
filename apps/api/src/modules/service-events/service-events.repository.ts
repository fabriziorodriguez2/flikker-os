import { Injectable } from '@nestjs/common';
import {
  MessageChannel,
  MessageStatus,
  ServiceEventCreatedVia,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ServiceEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCustomer(businessId: string, customerId: string) {
    return this.prisma.customer.findFirst({
      where: { id: customerId, businessId, isActive: true },
      select: { id: true, phoneE164: true, name: true },
    });
  }

  findCustomerByPhone(businessId: string, phoneE164: string) {
    return this.prisma.customer.findFirst({
      where: { businessId, phoneE164, isActive: true },
      select: { id: true, phoneE164: true, name: true },
    });
  }

  findRecentForCustomer(businessId: string, customerId: string, since: Date) {
    return this.prisma.serviceEvent.findFirst({
      where: {
        businessId,
        customerId,
        eventAt: { gte: since },
      },
      orderBy: { eventAt: 'desc' },
    });
  }

  createWithMessage(data: {
    businessId: string;
    customerId: string;
    serviceType: string;
    eventAt: Date;
    createdVia: ServiceEventCreatedVia;
    trackingToken: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.serviceEvent.create({
        data: {
          businessId: data.businessId,
          customerId: data.customerId,
          serviceType: data.serviceType,
          eventAt: data.eventAt,
          createdVia: data.createdVia,
        },
        include: {
          customer: {
            select: { id: true, name: true, phoneE164: true },
          },
        },
      });

      const message = await tx.message.create({
        data: {
          businessId: data.businessId,
          customerId: data.customerId,
          serviceEventId: event.id,
          trackingToken: data.trackingToken,
          channel: MessageChannel.whatsapp,
          status: MessageStatus.queued,
        },
      });

      return { event, message };
    });
  }

  findMany(businessId: string, options: { page: number; limit: number }) {
    const where = { businessId };

    return this.prisma.$transaction([
      this.prisma.serviceEvent.count({ where }),
      this.prisma.serviceEvent.findMany({
        where,
        include: {
          customer: {
            select: { id: true, name: true, phoneE164: true },
          },
        },
        orderBy: { eventAt: 'desc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);
  }
}
