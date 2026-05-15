import { Injectable } from '@nestjs/common';
import {
  MessageChannel,
  MessageStatus,
  ServiceEventCreatedVia,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface CustomerData {
  name: string;
  phoneE164: string;
  email?: string;
  lastServiceAt?: Date;
  birthday?: Date;
}

type CustomerUpdateData = Partial<Omit<CustomerData, 'email' | 'birthday'>> & {
  email?: string | null;
  birthday?: Date | null;
  optedOut?: boolean;
  isActive?: boolean;
};

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(
    businessId: string,
    options: { search?: string; page: number; limit: number },
  ) {
    const where = {
      businessId,
      isActive: true,
      ...(options.search
         {
            OR: [
              {
                name: {
                  contains: options.search,
                  mode: 'insensitive' as const,
                },
              },
              { phoneE164: { contains: options.search } },
            ],
          }
        : {}),
    };

    return this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);
  }

  findOne(businessId: string, id: string) {
    return this.prisma.customer.findFirst({
      where: { id, businessId, isActive: true },
    });
  }

  findByPhone(businessId: string, phoneE164: string) {
    return this.prisma.customer.findFirst({
      where: { businessId, phoneE164, isActive: true },
    });
  }

  findManyByPhones(businessId: string, phoneE164: string[]) {
    return this.prisma.customer.findMany({
      where: {
        businessId,
        phoneE164: { in: phoneE164 },
        isActive: true,
      },
      select: {
        phoneE164: true,
      },
    });
  }

  create(businessId: string, data: CustomerData) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          businessId,
          name: data.name,
          phoneE164: data.phoneE164,
          email: data.email,
          birthday: data.birthday,
        },
      });

      if (data.lastServiceAt) {
        await tx.serviceEvent.create({
          data: {
            businessId,
            customerId: customer.id,
            serviceType: 'Servicio',
            eventAt: data.lastServiceAt,
            createdVia: ServiceEventCreatedVia.csv_batch,
          },
        });
      }

      return customer;
    });
  }

  createMany(businessId: string, rows: CustomerData[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.customer.createMany({
        data: rows.map((row) => ({
          businessId,
          name: row.name,
          phoneE164: row.phoneE164,
          email: row.email,
          birthday: row.birthday,
        })),
      });

      const customersWithServiceEvents = rows.filter(
        (row) => row.lastServiceAt,
      );

      if (customersWithServiceEvents.length > 0) {
        const createdCustomers = await tx.customer.findMany({
          where: {
            businessId,
            phoneE164: {
              in: customersWithServiceEvents.map((row) => row.phoneE164),
            },
          },
          select: {
            id: true,
            phoneE164: true,
          },
        });
        const customerIdByPhone = new Map(
          createdCustomers.map((customer) => [customer.phoneE164, customer.id]),
        );

        await tx.serviceEvent.createMany({
          data: customersWithServiceEvents
            .map((row) => ({
              businessId,
              customerId: customerIdByPhone.get(row.phoneE164)  '',
              serviceType: 'Servicio',
              eventAt: row.lastServiceAt!,
              createdVia: ServiceEventCreatedVia.csv_batch,
            }))
            .filter((row) => row.customerId),
        });
      }

      return rows.length;
    });
  }

  update(businessId: string, id: string, data: CustomerUpdateData) {
    return this.prisma.customer.updateMany({
      where: { id, businessId },
      data,
    });
  }

  async createMessage(data: {
    businessId: string;
    customerId: string;
    trackingToken: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: {
          id: data.customerId,
          businessId: data.businessId,
          isActive: true,
        },
      });

      if (!customer || customer.optedOut) return null;

      return tx.message.create({
        data: {
          businessId: data.businessId,
          customerId: data.customerId,
          trackingToken: data.trackingToken,
          channel: MessageChannel.whatsapp,
          status: MessageStatus.queued,
        },
      });
    });
  }
}
