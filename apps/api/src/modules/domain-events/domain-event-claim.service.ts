import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Reclamo atómico genérico de "este evento de negocio ya se procesó" —
 * mismo idiom que `OwnerLifecycleEmailLogService.claimOnce` (crear la fila
 * PRIMERO, atrapar `P2002` si ya existía: el índice único es la garantía
 * real, nunca una lectura-y-luego-escritura), generalizado sobre
 * `DomainEvent` para eventos que no son específicamente un email de
 * lifecycle de negocio — ver el comentario del modelo en schema.prisma.
 *
 * Un solo claim por evento completo (`eventType:entityId`), no uno por
 * canal: el caller dispara TODOS los side effects (email, WhatsApp,
 * notificación al owner de Flikker) dentro de la misma ejecución que ganó
 * el claim. Si un canal falla a mitad de camino, el evento ya quedó
 * reclamado — no hay reintento automático de "solo lo que faltó" (mismo
 * trade-off que `sendOnce`/`sendOnceWhatsApp` ya aceptan: evitar un
 * duplicado importa más acá que reintentar un canal que falló solo).
 */
@Injectable()
export class DomainEventClaimService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `true` = ganaste el reclamo (primera vez que se ve este evento),
   * `false` = ya estaba procesado — el caller no debe disparar ningún side
   * effect.
   */
  async claimOnce(eventType: string, entityId: string): Promise<boolean> {
    try {
      await this.prisma.domainEvent.create({
        data: { eventType, entityId },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }
}
