import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ServiceEventCreatedVia } from '@prisma/client';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { ReviewRequestQueue } from '../../jobs/review-request.queue';
import { BatchServiceEventsCsvDto } from './dto/batch-service-events-csv.dto';
import { CreateServiceEventDto } from './dto/create-service-event.dto';
import { ServiceEventsRepository } from './service-events.repository';

const DEDUPE_WINDOW_HOURS = 12;
const DUPLICATE_MESSAGE =
  'Ya hay un servicio registrado para este paciente en las últimas 12 horas.';

@Injectable()
export class ServiceEventsService {
  constructor(
    private readonly repository: ServiceEventsRepository,
    private readonly reviewRequestQueue: ReviewRequestQueue,
  ) {}

  async create(businessId: string, dto: CreateServiceEventDto) {
    const { event, message } = await this.createWithQueuedMessage(businessId, {
      customerId: dto.customerId,
      serviceType: dto.serviceType,
      eventAt: this.parseEventAt(dto.eventAt),
      createdVia: dto.createdVia,
    });

    await this.reviewRequestQueue.enqueue({
      businessId,
      customerId: event.customerId,
      messageId: message.id,
    });

    return event;
  }

  async list(businessId: string, query: { page?: string; limit?: string }) {
    const page = Math.max(Number(query.page  1), 1);
    const limit = Math.min(Math.max(Number(query.limit  20), 1), 100);
    const [total, data] = await this.repository.findMany(businessId, {
      page,
      limit,
    });

    return { data, total, page, limit };
  }

  async batchCsv(businessId: string, dto: BatchServiceEventsCsvDto) {
    const rows = this.parseCsv(dto.csv);
    const errors: Array<{ row: number; message: string }> = [];
    let created = 0;

    for (const row of rows) {
      try {
        const customerId = await this.resolveCustomerId(businessId, row);
        const { event, message } = await this.createWithQueuedMessage(
          businessId,
          {
            customerId,
            serviceType: row.serviceType || 'Servicio',
            eventAt: this.parseEventAt(row.eventAt),
            createdVia: ServiceEventCreatedVia.csv_batch,
          },
        );
        await this.reviewRequestQueue.enqueue({
          businessId,
          customerId: event.customerId,
          messageId: message.id,
        });
        created += 1;
      } catch (error) {
        errors.push({
          row: row.rowNumber,
          message: error instanceof Error  error.message : 'Error',
        });
      }
    }

    return { created, errors };
  }

  private async createWithQueuedMessage(
    businessId: string,
    data: {
      customerId: string;
      serviceType: string;
      eventAt: Date;
      createdVia: ServiceEventCreatedVia;
    },
  ) {
    const customer = await this.repository.findCustomer(
      businessId,
      data.customerId,
    );
    if (!customer) throw new NotFoundException('Customer not found');

    const recent = await this.repository.findRecentForCustomer(
      businessId,
      data.customerId,
      new Date(Date.now() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000),
    );
    if (recent) throw new ConflictException(DUPLICATE_MESSAGE);

    return this.repository.createWithMessage({
      businessId,
      customerId: data.customerId,
      serviceType: data.serviceType.trim(),
      eventAt: data.eventAt,
      createdVia: data.createdVia,
      trackingToken: this.generateTrackingToken(),
    });
  }

  private async resolveCustomerId(
    businessId: string,
    row: { customerId?: string; phone?: string },
  ) {
    if (row.customerId) return row.customerId;
    if (!row.phone) throw new NotFoundException('Customer not found');

    const customer = await this.repository.findCustomerByPhone(
      businessId,
      normalizeToE164(row.phone),
    );
    if (!customer) throw new NotFoundException('Customer not found');
    return customer.id;
  }

  private parseCsv(csv: string) {
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];

    const headers = this.splitCsvLine(lines[0]).map((header) =>
      header.trim().toLowerCase().replace(/\s+/g, ''),
    );

    return lines.slice(1).map((line, index) => {
      const values = this.splitCsvLine(line);
      const record = new Map<string, string>();
      headers.forEach((header, valueIndex) => {
        record.set(header, values[valueIndex]?.trim()  '');
      });

      return {
        rowNumber: index + 2,
        customerId: record.get('customerid') || undefined,
        phone:
          record.get('telefono') ?
          record.get('teléfono') ?
          record.get('phone') ?
          record.get('tel'),
        serviceType: record.get('servicetype')  record.get('servicio'),
        eventAt: record.get('eventat')  record.get('fecha')  undefined,
      };
    });
  }

  private splitCsvLine(line: string) {
    const values: string[] = [];
    let current = '';
    let quoted = false;

    for (const char of line) {
      if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current);
    return values;
  }

  private parseEventAt(value?: string) {
    if (!value) {
      return new Date();
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('eventAt debe ser una fecha valida.');
    }

    return date;
  }

  private generateTrackingToken() {
    return randomBytes(8).toString('base64url');
  }
}
