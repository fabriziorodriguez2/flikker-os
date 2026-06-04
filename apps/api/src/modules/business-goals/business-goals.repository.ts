import { Injectable } from '@nestjs/common';
import { BusinessGoalType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BusinessGoalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCurrent(businessId: string) {
    return this.prisma.businessGoal.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: {
    businessId: string;
    type: BusinessGoalType;
    target: number;
    deadline: Date;
  }) {
    return this.prisma.businessGoal.create({ data });
  }
}
