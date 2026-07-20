import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BenefitsRepository, type BenefitData } from './benefits.repository';
import { CreateBenefitDto } from './dto/create-benefit.dto';
import { UpdateBenefitDto } from './dto/update-benefit.dto';

@Injectable()
export class BenefitsService {
  constructor(private readonly repository: BenefitsRepository) {}

  list(businessId: string) {
    return this.repository.findMany(businessId);
  }

  getActive(businessId: string) {
    return this.repository.findActive(businessId);
  }

  async getOne(businessId: string, id: string) {
    const benefit = await this.repository.findOne(businessId, id);
    if (!benefit) throw new NotFoundException('Benefit not found');
    return benefit;
  }

  async create(businessId: string, dto: CreateBenefitDto) {
    const dates = this.resolveDates(dto.startDate, dto.endDate);
    return this.repository.create(businessId, {
      type: dto.type,
      title: dto.title,
      description: dto.description,
      terms: dto.terms,
      recurrence: dto.recurrence,
      active: dto.active ?? false,
      ...dates,
    });
  }

  async update(businessId: string, id: string, dto: UpdateBenefitDto) {
    const data: Partial<BenefitData> = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.terms !== undefined) data.terms = dto.terms;
    if (dto.recurrence !== undefined) data.recurrence = dto.recurrence;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      Object.assign(data, this.resolveDates(dto.startDate, dto.endDate));
    }

    const updated = await this.repository.update(businessId, id, data);
    if (!updated) throw new NotFoundException('Benefit not found');
    return updated;
  }

  async activate(businessId: string, id: string) {
    const updated = await this.repository.setActive(businessId, id, true);
    if (!updated) throw new NotFoundException('Benefit not found');
    return updated;
  }

  async deactivate(businessId: string, id: string) {
    const updated = await this.repository.setActive(businessId, id, false);
    if (!updated) throw new NotFoundException('Benefit not found');
    return updated;
  }

  async remove(businessId: string, id: string) {
    const removed = await this.repository.remove(businessId, id);
    if (!removed) throw new NotFoundException('Benefit not found');
    return { ok: true };
  }

  async getParticipants(businessId: string, id: string) {
    // Ensure the benefit belongs to the tenant before listing participants.
    await this.getOne(businessId, id);
    return this.repository.findParticipants(businessId, id);
  }

  /**
   * Records that a customer opts into a benefit (e.g. a raffle entry).
   * Used by the public QR flow; kept here so tenancy stays server-side.
   */
  registerParticipation(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    return this.repository.registerParticipation(
      businessId,
      benefitId,
      customerId,
    );
  }

  private resolveDates(
    startRaw?: string,
    endRaw?: string,
  ): Pick<BenefitData, 'startDate' | 'endDate'> {
    const startDate = startRaw ? new Date(startRaw) : null;
    const endDate = endRaw ? new Date(endRaw) : null;

    if (startDate && Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('startDate is invalid');
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('endDate is invalid');
    }
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate must be after startDate');
    }

    return { startDate, endDate };
  }
}
