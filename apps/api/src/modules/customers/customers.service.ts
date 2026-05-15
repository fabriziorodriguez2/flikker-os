import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
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

interface ImportMapping {
  name?: string;
  phone?: string;
  email?: string;
  lastServiceAt?: string;
}

interface ImportFileParams {
  file: Express.Multer.File;
  mapping?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly repository: CustomersRepository) {}

  async list(
    businessId: string,
    query: { search?: string; page?: string; limit?: string },
  ) {
    const page = Math.max(Number(query.page  1), 1);
    const limit = Math.min(Math.max(Number(query.limit  20), 1), 100);
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
      birthday: this.parseOptionalDate(dto.birthday),
    });
  }

  async update(businessId: string, customerId: string, dto: UpdateCustomerDto) {
    await this.assertExists(businessId, customerId);

    const data: {
      name?: string;
      phoneE164?: string;
      email?: string | null;
      birthday?: Date | null;
    } = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) data.email = dto.email.trim() || null;
    if (dto.birthday !== undefined) {
      data.birthday = dto.birthday.trim()
         this.parseOptionalDate(dto.birthday)
        : null;
    }
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

  async importFile(businessId: string, params: ImportFileParams) {
    const mapping = this.parseMapping(params.mapping);
    const rows = this.parseImportFile(params.file, mapping);
    const failed: Array<{ row: number; reason: string }> = [];
    const valid: CsvRow[] = [];

    rows.forEach((row) => {
      if (!row.name || !row.phone) {
        failed.push({
          row: row.rowNumber,
          reason: 'Nombre y teléfono son obligatorios',
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
    const seenPhones = new Set<string>();
    let duplicates = 0;

    for (let i = 0; i < valid.length; i += 1) {
      try {
        const phoneE164 = normalizeToE164(valid[i].phone);
        const lastServiceAt = this.parseOptionalDate(valid[i].lastServiceAt);

        if (seenPhones.has(phoneE164)) {
          duplicates += 1;
          continue;
        }
        seenPhones.add(phoneE164);

        normalized.push({
          name: valid[i].name.trim(),
          phoneE164,
          email: valid[i].email?.trim() || undefined,
          lastServiceAt,
        });
      } catch (error) {
        failed.push({
          row: valid[i].rowNumber,
          reason: error instanceof Error  error.message : 'Teléfono inválido',
        });
      }
    }

    const existingPhones = normalized.length
       await this.repository.findManyByPhones(
          businessId,
          normalized.map((row) => row.phoneE164),
        )
      : [];
    const existingPhoneSet = new Set(
      existingPhones.map((customer) => customer.phoneE164),
    );
    const toCreate = normalized.filter((row) => {
      if (existingPhoneSet.has(row.phoneE164)) {
        duplicates += 1;
        return false;
      }
      return true;
    });

    const imported = toCreate.length
       await this.repository.createMany(businessId, toCreate)
      : 0;

    return {
      imported,
      failed,
      duplicates,
    };
  }

  importCsv(businessId: string, dto: ImportCsvDto) {
    return this.importFile(businessId, {
      file: {
        originalname: 'import.csv',
        buffer: Buffer.from(dto.csv, 'utf8'),
      } as Express.Multer.File,
    });
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
        record.set(header, values[index]?.trim()  '');
      });

      return {
        rowNumber: index + 2,
        name: record.get('nombre')  record.get('name')  '',
        phone:
          record.get('telefono') ?
          record.get('teléfono') ?
          record.get('phone') ?
          '',
        email: record.get('email') || undefined,
        lastServiceAt:
          record.get('fecha ultimo servicio') ?
          record.get('fecha último servicio') ?
          record.get('lastserviceat') ?
          record.get('last_service_at') ?
          undefined,
      };
    });
  }

  private parseImportFile(file: Express.Multer.File, mapping: ImportMapping) {
    const extension = this.getFileExtension(file.originalname);
    if (!['csv', 'xlsx'].includes(extension)) {
      throw new BadRequestException('Solo se aceptan archivos .csv o .xlsx');
    }

    const workbook = XLSX.read(file.buffer, {
      type: 'buffer',
      raw: false,
      cellDates: false,
    });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return [];

    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(
      workbook.Sheets[firstSheet],
      {
        defval: '',
        raw: false,
      },
    );

    return rows.map((row, index) => {
      const normalized = new Map<string, string>();
      Object.entries(row).forEach(([key, value]) => {
        normalized.set(this.normalizeHeader(key), String(value  '').trim());
      });

      return {
        rowNumber: index + 2,
        name: this.getMappedValue(normalized, mapping.name, ['nombre', 'name']),
        phone: this.getMappedValue(normalized, mapping.phone, [
          'telefono',
          'teléfono',
          'phone',
        ]),
        email:
          this.getMappedValue(normalized, mapping.email, ['email']) ||
          undefined,
        lastServiceAt:
          this.getMappedValue(normalized, mapping.lastServiceAt, [
            'fecha ultimo servicio',
            'fecha último servicio',
            'fecha_ultimo_servicio',
            'lastserviceat',
            'last_service_at',
          ]) || undefined,
      };
    });
  }

  private parseMapping(raw?: string): ImportMapping {
    if (!raw) return {};

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        name: this.asOptionalString(parsed.name),
        phone: this.asOptionalString(parsed.phone),
        email: this.asOptionalString(parsed.email),
        lastServiceAt:
          this.asOptionalString(parsed.lastServiceAt) ?
          this.asOptionalString(parsed.lastServiceDate),
      };
    } catch {
      throw new BadRequestException('Mapeo de columnas inválido');
    }
  }

  private asOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim()  value.trim() : undefined;
  }

  private getMappedValue(
    row: Map<string, string>,
    mappedHeader: string | undefined,
    fallbacks: string[],
  ) {
    if (mappedHeader) {
      return row.get(this.normalizeHeader(mappedHeader))  '';
    }

    for (const fallback of fallbacks) {
      const value = row.get(this.normalizeHeader(fallback));
      if (value) return value;
    }

    return '';
  }

  private getFileExtension(filename: string) {
    return filename.split('.').pop()?.toLowerCase()  '';
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
