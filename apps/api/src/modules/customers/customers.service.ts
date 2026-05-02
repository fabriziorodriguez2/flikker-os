import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ImportCsvDto } from './dto/import-csv.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersRepository } from './customers.repository';

interface CsvRow {
  rowNumber: number;
  name: string;
  phone: string;
  email?: string;
  lastServiceAt?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly repository: CustomersRepository) {}

  async list(
    businessId: string,
    query: { search?: string; page?: string; limit?: string },
  ) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const [total, data] = await this.repository.findMany(businessId, {
      search: query.search?.trim() || undefined,
      page,
      limit,
    });

    return { data, total, page, limit };
  }

  async create(businessId: string, dto: CreateCustomerDto) {
    const phoneE164 = normalizeToE164(dto.phone);
    await this.assertPhoneAvailable(businessId, phoneE164);

    return this.repository.create(businessId, {
      name: dto.name.trim(),
      phoneE164,
      email: dto.email?.trim() || undefined,
      lastServiceAt: this.parseOptionalDate(dto.lastServiceAt),
    });
  }

  async update(businessId: string, customerId: string, dto: UpdateCustomerDto) {
    await this.assertExists(businessId, customerId);

    const data: {
      name?: string;
      phoneE164?: string;
      email?: string | null;
    } = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) data.email = dto.email.trim() || null;
    if (dto.phone !== undefined) {
      const phoneE164 = normalizeToE164(dto.phone);
      const existing = await this.repository.findByPhone(businessId, phoneE164);
      if (existing && existing.id !== customerId) {
        throw new ConflictException('Customer phone already exists');
      }
      data.phoneE164 = phoneE164;
    }

    await this.repository.update(businessId, customerId, data);
    return this.repository.findOne(businessId, customerId);
  }

  async softDelete(businessId: string, customerId: string) {
    await this.assertExists(businessId, customerId);
    await this.repository.update(businessId, customerId, { isActive: false });
    return { ok: true };
  }

  async optOut(businessId: string, customerId: string) {
    await this.assertExists(businessId, customerId);
    await this.repository.update(businessId, customerId, { optedOut: true });
    return this.repository.findOne(businessId, customerId);
  }

  async importCsv(businessId: string, dto: ImportCsvDto) {
    const rows = this.parseCsv(dto.csv);
    const errors: Array<{ row: number; message: string }> = [];
    const valid: CsvRow[] = [];

    rows.forEach((row) => {
      if (!row.name || !row.phone) {
        errors.push({
          row: row.rowNumber,
          message: 'Name and phone are required',
        });
        return;
      }
      valid.push(row);
    });

    const normalized: Array<{
      name: string;
      phoneE164: string;
      email?: string;
      lastServiceAt?: Date;
    }> = [];
    for (let i = 0; i < valid.length; i += 1) {
      try {
        const phoneE164 = normalizeToE164(valid[i].phone);
        const lastServiceAt = this.parseOptionalDate(valid[i].lastServiceAt);
        const existing = await this.repository.findByPhone(
          businessId,
          phoneE164,
        );
        if (existing) {
          errors.push({
            row: valid[i].rowNumber,
            message: 'Customer phone already exists',
          });
          continue;
        }
        normalized.push({
          name: valid[i].name.trim(),
          phoneE164,
          email: valid[i].email?.trim() || undefined,
          lastServiceAt,
        });
      } catch (error) {
        errors.push({
          row: valid[i].rowNumber,
          message: error instanceof Error ? error.message : 'Invalid phone',
        });
      }
    }

    const created = normalized.length
      ? await this.repository.createMany(businessId, normalized)
      : [];

    return {
      created: created.length,
      errors,
    };
  }

  async createMessageForCustomer(
    businessId: string,
    customerId: string,
    trackingToken: string,
  ) {
    const message = await this.repository.createMessage({
      businessId,
      customerId,
      trackingToken,
    });

    if (!message) {
      throw new BadRequestException('Customer opted out or is not available');
    }

    return message;
  }

  private async assertExists(businessId: string, customerId: string) {
    const customer = await this.repository.findOne(businessId, customerId);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private async assertPhoneAvailable(businessId: string, phoneE164: string) {
    const existing = await this.repository.findByPhone(businessId, phoneE164);
    if (existing) throw new ConflictException('Customer phone already exists');
  }

  private parseCsv(csv: string): CsvRow[] {
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];

    const headers = this.splitCsvLine(lines[0]).map((header) =>
      this.normalizeHeader(header),
    );

    return lines.slice(1).map((line, index) => {
      const values = this.splitCsvLine(line);
      const record = new Map<string, string>();
      headers.forEach((header, index) => {
        record.set(header, values[index]?.trim() ?? '');
      });

      return {
        rowNumber: index + 2,
        name: record.get('nombre') ?? record.get('name') ?? '',
        phone:
          record.get('telefono') ??
          record.get('teléfono') ??
          record.get('phone') ??
          '',
        email: record.get('email') || undefined,
        lastServiceAt:
          record.get('fecha ultimo servicio') ??
          record.get('fecha último servicio') ??
          record.get('lastserviceat') ??
          record.get('last_service_at') ??
          undefined,
      };
    });
  }

  private normalizeHeader(header: string) {
    return header.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private parseOptionalDate(value?: string) {
    if (!value?.trim()) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid last service date');
    }
    return parsed;
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
}
