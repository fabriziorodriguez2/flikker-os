import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as QRCode from 'qrcode';
import { VisitSource } from '@prisma/client';
import {
  UpdateVisitSourceData,
  VisitSourcesRepository,
} from './visit-sources.repository';
import { CreateVisitSourceDto } from './dto/create-visit-source.dto';
import { UpdateVisitSourceDto } from './dto/update-visit-source.dto';

@Injectable()
export class VisitSourcesService {
  constructor(private readonly repository: VisitSourcesRepository) {}

  /**
   * Lists the business's sources, materializing the default one first.
   *
   * The lazy creation only runs for a business on Check-in V2. Before the
   * rollout flag existed, merely opening this view created a VisitSource for
   * any business — including legacy ones that must never own V2 rows. Rows
   * created that way in the past are left untouched: they simply stay inert,
   * because nothing reads them while the business is LEGACY.
   */
  async list(businessId: string) {
    if (await this.repository.isCheckinV2Business(businessId)) {
      await this.repository.ensureDefaultSource(businessId);
    }
    return this.repository.findMany(businessId);
  }

  async getOne(businessId: string, id: string): Promise<VisitSource> {
    const source = await this.repository.findOne(businessId, id);
    if (!source) throw new NotFoundException('Visit source not found');
    return source;
  }

  create(businessId: string, dto: CreateVisitSourceDto) {
    return this.repository.create(businessId, {
      name: dto.name.trim(),
      type: dto.type,
    });
  }

  async update(businessId: string, id: string, dto: UpdateVisitSourceDto) {
    const data: UpdateVisitSourceData = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.repository.update(businessId, id, data);
    if (!updated) throw new NotFoundException('Visit source not found');
    return updated;
  }

  /**
   * Deletion is intentionally conservative to avoid data loss:
   *  - the default source can never be deleted (it anchors legacy /qr compat);
   *  - a source with visits is kept (deactivate it instead) so historical
   *    check-ins are never detached.
   */
  async remove(businessId: string, id: string) {
    const source = await this.getOne(businessId, id);
    if (source.isDefault) {
      throw new BadRequestException(
        'No se puede eliminar la fuente por defecto. Desactivala si no querés usarla.',
      );
    }
    const visitCount = await this.repository.countVisits(businessId, id);
    if (visitCount > 0) {
      throw new BadRequestException(
        'La fuente tiene visitas asociadas. Desactivala en lugar de eliminarla para no perder el historial.',
      );
    }
    await this.repository.remove(businessId, id);
    return { ok: true };
  }

  /** Ensures the business has its default source (used by the public flow). */
  ensureDefaultSource(businessId: string) {
    return this.repository.ensureDefaultSource(businessId);
  }

  /** Public check-in URL a source's QR/NFC points to. */
  buildCheckinUrl(token: string): string {
    const base = (process.env.WEB_BASE_URL ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
    return `${base}/check-in/${token}`;
  }

  /** Renders the source's check-in URL as a downloadable QR PNG. */
  async getQrPng(businessId: string, id: string): Promise<Buffer> {
    const source = await this.getOne(businessId, id);
    return QRCode.toBuffer(this.buildCheckinUrl(source.token), {
      type: 'png',
      width: 1024,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
  }
}
