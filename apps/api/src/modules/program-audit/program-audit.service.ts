import { Injectable } from '@nestjs/common';
import { ProgramAuditEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Bitácora mínima de Programa (Historial). Solo se escribe para los cambios
 * que no dejan ninguna fecha real en otro lado — ver el comentario del
 * modelo en `schema.prisma`. Nunca se llama desde el motor de Retention V2 ni
 * desde el check-in público: solo desde las escrituras que hace el DUEÑO en
 * /dashboard/programa.
 */
@Injectable()
export class ProgramAuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: {
    businessId: string;
    type: ProgramAuditEventType;
    message: string;
    actorUserId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.programAuditEvent.create({
      data: {
        businessId: input.businessId,
        type: input.type,
        message: input.message,
        actorUserId: input.actorUserId ?? null,
        metadata: input.metadata,
      },
    });
  }

  list(businessId: string, limit = 50) {
    return this.prisma.programAuditEvent.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
