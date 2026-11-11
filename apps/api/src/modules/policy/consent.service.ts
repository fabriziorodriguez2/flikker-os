import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConsentAction,
  ConsentChannel,
  ConsentSource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeToE164 } from '../../common/utils/phone.util';
import {
  CONSENT_TEXT_VERSION,
  effectiveConsent,
  type ConsentStatus,
} from './policy-rules';

export interface RecordConsentInput {
  businessId: string;
  customerId: string;
  channel: ConsentChannel;
  action: ConsentAction;
  source: ConsentSource;
  actorUserId?: string | null;
  note?: string | null;
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
          input.action === ConsentAction.GRANTED ? CONSENT_TEXT_VERSION : null,
        actorUserId: input.actorUserId ?? null,
        note: input.note?.slice(0, 500) ?? null,
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
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT DISTINCT ON (e.customer_id) e.customer_id, e.action
        FROM customer_consent_events e
        JOIN "Customer" c ON c.id = e.customer_id
        WHERE e.business_id = ${businessId}
          AND e.channel = 'WHATSAPP'
          AND e.action IN ('GRANTED', 'REVOKED')
          AND c."isActive" = true
          AND c.opted_out = false
        ORDER BY e.customer_id, e.created_at DESC
      ) latest
      WHERE latest.action = 'GRANTED'
        AND NOT EXISTS (
          SELECT 1 FROM customer_consent_events s
          WHERE s.customer_id = latest.customer_id
            AND s.channel = 'WHATSAPP'
            AND s.action = 'SUPPRESSED'
            AND NOT EXISTS (
              SELECT 1 FROM customer_consent_events u
              WHERE u.customer_id = s.customer_id
                AND u.channel = 'WHATSAPP'
                AND u.action = 'UNSUPPRESSED'
                AND u.created_at > s.created_at
            )
        )`;
    return Number(rows[0]?.count ?? 0);
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
