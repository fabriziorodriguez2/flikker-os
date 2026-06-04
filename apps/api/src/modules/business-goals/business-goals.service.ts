import { BadRequestException, Injectable } from '@nestjs/common';
import { BusinessGoalsRepository } from './business-goals.repository';
import { CreateBusinessGoalDto } from './dto/create-business-goal.dto';

@Injectable()
export class BusinessGoalsService {
  constructor(private readonly repository: BusinessGoalsRepository) {}

  getCurrent(businessId: string) {
    return this.repository.findCurrent(businessId);
  }

  async create(businessId: string, dto: CreateBusinessGoalDto) {
    let deadline: Date;
    if (dto.deadline) {
      deadline = new Date(dto.deadline);
    } else if (dto.planDays && dto.planDays > 0) {
      deadline = new Date(Date.now() + dto.planDays * 24 * 60 * 60 * 1000);
    } else {
      throw new BadRequestException('deadline or planDays is required');
    }

    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      throw new BadRequestException('deadline must be a future date');
    }

    return this.repository.create({
      businessId,
      type: dto.type,
      target: dto.target,
      deadline,
    });
  }
}
