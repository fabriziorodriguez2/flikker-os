import { Injectable } from '@nestjs/common';
import {
  AppointmentNotificationStatus,
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
  origin?: string;
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

  async findMany(
    businessId: string,
    options: {
      search?: string;
      page: number;
      limit: number;
      origin?: string[];
      from?: Date;
      to?: Date;
    },
  ) {
    // Uruguay is UTC-3: day starts at 03:00 UTC
    const todayStart = new Date();
    todayStart.setUTCHours(3, 0, 0, 0);
    if (new Date() < todayStart) {
      todayStart.setUTCDate(todayStart.getUTCDate() - 1);
    }

    const where = {
      businessId,
      isActive: true,
      ...(options.search
        ? {
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
      ...(options.origin?.length ? { origin: { in: options.origin } } : {}),
      ...(options.from || options.to
        ? {
            createdAt: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lt: options.to } : {}),
            },
          }
        : {}),
    };

    const [total, customers] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);

    if (customers.length === 0) return [total, []] as const;

    const attendedEvents = await this.prisma.serviceEvent.findMany({
      where: {
        businessId,
        customerId: { in: customers.map((c) => c.id) },
        eventAt: { gte: todayStart },
      },
      select: { customerId: true },
      distinct: ['customerId'],
    });
    const attendedSet = new Set(attendedEvents.map((e) => e.customerId));

    return [
      total,
      customers.map((c) => ({ ...c, attendedToday: attendedSet.has(c.id) })),
    ] as const;
  }

  findOne(businessId: string, id: string) {
    return this.prisma.customer.findFirst({
      where: { id, businessId, isActive: true },
    });
  }

  findOneWithBusiness(businessId: string, id: string) {
    return this.prisma.customer.findFirst({
      where: { id, businessId, isActive: true },
      include: { business: { select: { name: true } } },
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

  findManyByIds(businessId: string, ids: string[]) {
    return this.prisma.customer.findMany({
      where: { businessId, id: { in: ids }, isActive: true },
      select: { id: true, name: true, phoneE164: true, optedOut: true },
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
          origin: data.origin ?? 'manual',
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
          origin: row.origin ?? 'manual',
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
              customerId: customerIdByPhone.get(row.phoneE164) ?? '',
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

  createAppointmentNotification(data: {
    businessId: string;
    contactId: string;
    appointmentDate: Date;
    status: AppointmentNotificationStatus;
  }) {
    return this.prisma.appointmentNotification.create({
      data,
    });
  }

  // ── Filter previews (manual campaign recipient selector) ──────────────────

  private thirtyDaysAgo(): Date {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  async getFilterCounts(businessId: string) {
    const thirty = this.thirtyDaysAgo();

    const [total, byOriginRaw, withBirthday, noReview, notAttended30d] =
      await Promise.all([
        this.prisma.customer.count({
          where: { businessId, isActive: true },
        }),
        this.prisma.customer.groupBy({
          by: ['origin'],
          where: { businessId, isActive: true },
          _count: { _all: true },
        }),
        // Birthday list (compact) — month filter happens app-side because
        // Prisma has no portable month-extract operator.
        this.prisma.customer.findMany({
          where: {
            businessId,
            isActive: true,
            birthday: { not: null },
          },
          select: { birthday: true },
        }),
        this.prisma.customer.count({
          where: {
            businessId,
            isActive: true,
            messages: { some: {} },
            NOT: {
              messages: {
                some: { attributedGoogleReviews: { some: {} } },
              },
            },
          },
        }),
        this.prisma.customer.count({
          where: {
            businessId,
            isActive: true,
            NOT: {
              serviceEvents: { some: { eventAt: { gte: thirty } } },
            },
          },
        }),
      ]);

    const byOrigin: Record<string, number> = {
      qr: 0,
      whatsapp: 0,
      manual: 0,
    };
    for (const row of byOriginRaw) {
      byOrigin[row.origin] = row._count._all;
    }

    const currentMonth = new Date().getMonth();
    const birthdayThisMonth = withBirthday.filter(
      (c) => c.birthday && c.birthday.getMonth() === currentMonth,
    ).length;

    return {
      total,
      byOrigin,
      birthdayThisMonth,
      noReview,
      notAttended30d,
    };
  }

  async findByFilter(
    businessId: string,
    mode: string,
    origins: string[] | undefined,
    limit = 1000,
  ): Promise<{ id: string; name: string; phoneE164: string }[]> {
    const base = { businessId, isActive: true } as const;
    const select = { id: true, name: true, phoneE164: true } as const;

    if (mode === 'all') {
      return this.prisma.customer.findMany({
        where: base,
        select,
        take: limit,
      });
    }

    if (mode === 'by-origin') {
      const allowed = (origins ?? []).filter((o) =>
        ['qr', 'whatsapp', 'manual'].includes(o),
      );
      if (allowed.length === 0) return [];
      return this.prisma.customer.findMany({
        where: { ...base, origin: { in: allowed } },
        select,
        take: limit,
      });
    }

    if (mode === 'birthday-month') {
      // Pull customers with birthday set, filter app-side by current month.
      const candidates = await this.prisma.customer.findMany({
        where: { ...base, birthday: { not: null } },
        select: { ...select, birthday: true },
      });
      const month = new Date().getMonth();
      return candidates
        .filter((c) => c.birthday && c.birthday.getMonth() === month)
        .slice(0, limit)
        .map(({ id, name, phoneE164 }) => ({ id, name, phoneE164 }));
    }

    if (mode === 'no-review') {
      return this.prisma.customer.findMany({
        where: {
          ...base,
          messages: { some: {} },
          NOT: {
            messages: { some: { attributedGoogleReviews: { some: {} } } },
          },
        },
        select,
        take: limit,
      });
    }

    if (mode === 'not-attended-30d') {
      return this.prisma.customer.findMany({
        where: {
          ...base,
          NOT: {
            serviceEvents: {
              some: { eventAt: { gte: this.thirtyDaysAgo() } },
            },
          },
        },
        select,
        take: limit,
      });
    }

    return [];
  }
}
