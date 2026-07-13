import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';

@Injectable()
export class MessageTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, dto: CreateMessageTemplateDto) {
    return this.prisma.messageTemplate.create({
      data: {
        businessId,
        title: dto.title,
        body: dto.body,
        vertical: dto.vertical ?? 'CUSTOM',
        tag: dto.tag ?? 'Custom',
      },
    });
  }

  async findAll(businessId: string) {
    return this.prisma.messageTemplate.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(businessId: string, id: string) {
    return this.prisma.messageTemplate.deleteMany({
      where: { id, businessId },
    });
  }
}
