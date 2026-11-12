import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConsentAction,
  ConsentChannel,
  ConsentSource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { effectiveConsent, type ConsentStatus } from './policy-rules';
import { CONSENT_TEXT_VERSIONS } from './consent-texts';
import { contactableWhatsappCount } from './policy-usage';

export interface RecordConsentInput {
  businessId: string;
  customerId: string;
  channel: ConsentChannel;
  action: ConsentAction;
  source: ConsentSource;
  actorUserId?: string | null;
  note?: string | null;
  /** Versión del texto aceptado; por defecto la vigente del canal. */
  textVersion?: string | null;
  /**
   * Cuándo ocurrió. Solo para importar una autorización anterior con su
   * fecha real; en cualquier otro caso es "ahora".
   */
  occurredAt?: Date;
}

/**
 * Consentimiento por canal. Cada cambio es un evento nuevo (nunca se edita
 * ni se borra uno); el estado vigente se deriva. `Customer.optedOut` sigue
 * siendo el espejo que leen los caminos viejos: una baja de WhatsApp siempre
 * lo prende, y solo un alta efectiva lo apaga.
 */
@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: RecordConsentInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ConsentStatus> {
    const customer = await db.customer.findFirst({
      where: { id: input.customerId, businessId: input.businessId },
      select: { id: true, optedOut: true },
    });
    // Mismo 404 para "no existe" y "es de otro negocio".
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    await db.customerConsentEvent.create({
      data: {
        businessId: input.businessId,
        customerId: input.customerId,
        channel: input.channel,
        action: input.action,
        source: input.source,
        textVersion:
          input.action === ConsentAction.GRANTED
            ? (input.textVersion ?? CONSENT_TEXT_VERSIONS[input.channel])
            : null,
        actorUserId: input.actorUserId ?? null,
        note: input.note?.slice(0, 500) ?? null,
        ...(input.occurredAt ? { createdAt: input.occurredAt } : {}),
      },
    });

    const events = await db.customerConsentEvent.findMany({
      where: {
        businessId: input.businessId,
        customerId: input.customerId,
        channel: input.channel,
      },
      select: { action: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    // El último evento manda sobre el espejo, salvo que no diga nada
    // (UNKNOWN, p. ej. un UNSUPPRESSED sin alta): ahí la baja vieja sigue.
    const fromEvents = effectiveConsent(events, false);
    if (input.channel !== ConsentChannel.WHATSAPP) return fromEvents;

    if (fromEvents === 'UNKNOWN') {
      return customer.optedOut ? 'REVOKED' : 'UNKNOWN';
    }
    const optedOut = fromEvents !== 'GRANTED';
    if (optedOut !== customer.optedOut) {
      await db.customer.update({
        where: { id: customer.id },
        data: { optedOut },
      });
    }
    return fromEvents;
  }

  /** Estado vigente de un canal para un cliente (con el espejo `optedOut`). */
  async channelStatus(
    businessId: string,
    customerId: string,
    channel: ConsentChannel,
  ): Promise<ConsentStatus> {
    const [customer, events] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { id: customerId, businessId },
        select: { optedOut: true },
      }),
      this.prisma.customerConsentEvent.findMany({
        where: { businessId, customerId, channel },
        select: { action: true, createdAt: true },
      }),
    ]);
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return effectiveConsent(
      events,
      channel === ConsentChannel.WHATSAPP ? customer.optedOut : false,
    );
  }

  /**
   * El cliente decide desde una pantalla pública (check-in, Mi Flikker). Un
   * sí nunca levanta una supresión (queja o pedido de no contactar): esa
   * solo la levanta el comercio.
   */
  async setByCustomer(input: {
    businessId: string;
    customerId: string;
    channel: ConsentChannel;
    granted: boolean;
    source: ConsentSource;
  }): Promise<ConsentStatus> {
    const current = await this.channelStatus(
      input.businessId,
      input.customerId,
      input.channel,
    );
    if (current === 'SUPPRESSED') return current;
    if (input.granted ? current === 'GRANTED' : current !== 'GRANTED') {
      // Sin cambio: no se agregan eventos repetidos.
      return current;
    }
    return this.record({
      businessId: input.businessId,
      customerId: input.customerId,
      channel: input.channel,
      action: input.granted ? ConsentAction.GRANTED : ConsentAction.REVOKED,
      source: input.source,
    });
  }

  /** Estado vigente y el historial completo de un cliente (más nuevo primero). */
  async history(businessId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true, optedOut: true },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    const events = await this.prisma.customerConsentEvent.findMany({
      where: { businessId, customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        channel: true,
        action: true,
        source: true,
        textVersion: true,
        createdAt: true,
      },
    });
    const channelStatus = (channel: ConsentChannel) =>
      effectiveConsent(
        events.filter((e) => e.channel === channel),
        channel === ConsentChannel.WHATSAPP ? customer.optedOut : false,
      );
    return {
      whatsapp: channelStatus(ConsentChannel.WHATSAPP),
      email: channelStatus(ConsentChannel.EMAIL),
      events,
    };
  }

  /** Clientes activos con WhatsApp autorizado, para la pantalla de políticas. */
  async grantedWhatsappCount(businessId: string): Promise<number> {
    return contactableWhatsappCount(this.prisma, businessId);
  }

  /**
   * Baja por palabra clave desde WhatsApp. El número de Flikker es compartido
   * por todos los negocios, así que un "BAJA" no dice de cuál: se revoca en
   * todos los negocios donde ese teléfono es cliente. Es la lectura segura
   * de un pedido de no recibir más mensajes.
   */
  async revokeByPhone(rawPhone: string): Promise<number> {
    let phoneE164: string;
    try {
      phoneE164 = normalizeToE164(rawPhone.replace(/^whatsapp:/i, '').trim());
    } catch {
      return 0;
    }
    const customers = await this.prisma.customer.findMany({
      where: { phoneE164 },
      select: { id: true, businessId: true },
    });
    for (const customer of customers) {
      await this.record({
        businessId: customer.businessId,
        customerId: customer.id,
        channel: ConsentChannel.WHATSAPP,
        action: ConsentAction.REVOKED,
        source: ConsentSource.INBOUND_KEYWORD,
      });
    }
    return customers.length;
  }
}

/** "BAJA", "stop", "no quiero recibir más mensajes"… sin nada más. */
export function isOptOutKeyword(text: string): boolean {
  const normalized = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[.!¡¿?]+/g, '')
    .replace(/\s+/g, ' ');
  return (
    /^(baja|stop|cancelar|darme de baja|dar de baja)$/.test(normalized) ||
    /^no (quiero )?(recibir )?mas( mensajes)?$/.test(normalized)
  );
}
