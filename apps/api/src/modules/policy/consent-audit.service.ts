import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConsentAction, ConsentChannel, ConsentSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { ConsentService } from './consent.service';
import { effectiveConsent } from './policy-rules';
import {
  LEGACY_EXCLUSION_TEXT,
  buildConsentAudit,
  evidenceCoversChannel,
  legacyGrantedAtProblem,
  type LegacyEvidence,
  type LegacyExclusion,
} from './consent-audit';

export const LEGACY_IMPORT_MAX_ROWS = 5_000;

export interface LegacyImportInput {
  channel: ConsentChannel;
  evidence: LegacyEvidence;
  rows: { phone: string; grantedAt: string }[];
  /** Sin esto, solo vista previa: no se escribe nada. */
  confirm: boolean;
}

/**
 * Auditoría de la base de clientes y alta de autorizaciones anteriores
 * documentadas. Ningún cliente se borra ni pierde visitas, sellos o premios
 * por no tener autorización: esto solo decide a quién se le pueden mandar
 * promociones.
 */
@Injectable()
export class ConsentAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly auditLog: AuditService,
  ) {}

  async audit(businessId: string, now: Date = new Date()) {
    const [customers, lastVisits, events] = await Promise.all([
      this.prisma.customer.findMany({
        where: { businessId, isActive: true },
        select: {
          id: true,
          phoneE164: true,
          email: true,
          optedOut: true,
          flikkerAccountId: true,
        },
      }),
      this.prisma.visit.groupBy({
        by: ['customerId'],
        where: { businessId },
        _max: { occurredAt: true },
      }),
      this.prisma.customerConsentEvent.findMany({
        where: { businessId },
        select: {
          customerId: true,
          channel: true,
          action: true,
          source: true,
          createdAt: true,
        },
      }),
    ]);
    const lastVisit = new Map(
      lastVisits.map((v) => [v.customerId, v._max.occurredAt]),
    );
    return {
      ...buildConsentAudit(
        customers.map((c) => ({
          id: c.id,
          hasPhone: Boolean(c.phoneE164?.trim()),
          hasEmail: Boolean(c.email?.trim()),
          optedOut: c.optedOut,
          lastVisitAt: lastVisit.get(c.id) ?? null,
          linkedToMiFlikker: c.flikkerAccountId !== null,
        })),
        events,
        now,
      ),
      notes: [
        'Tener teléfono, haber hecho check-in o no haberse dado de baja no cuenta como autorización.',
        'Flikker no tenía un registro de autorizaciones anterior a este: si el comercio tiene autorizaciones documentadas fuera de Flikker, se importan con su prueba.',
        'Los clientes sin autorización siguen en Flikker con sus visitas, sellos y premios; solo no reciben promociones.',
      ],
    };
  }

  /**
   * Importa autorizaciones anteriores con prueba verificable. Siempre empieza
   * con una vista previa; escribe solo con `confirm`. La decide Platform
   * Admin: verificar el origen de una prueba es un trabajo humano.
   */
  async importLegacy(
    businessId: string,
    actorUserId: string,
    input: LegacyImportInput,
    now: Date = new Date(),
  ) {
    const { evidence } = input;
    for (const [field, value] of Object.entries(evidence)) {
      if (typeof value !== 'string' || value.trim().length < 5) {
        throw new BadRequestException(
          `Falta la prueba: "${field}" tiene que describir de dónde sale la autorización.`,
        );
      }
    }
    if (!evidenceCoversChannel(evidence, input.channel)) {
      throw new BadRequestException(
        `El texto que aceptó el cliente no menciona promociones por ${input.channel === 'WHATSAPP' ? 'WhatsApp' : 'email'}: no alcanza como prueba para este canal.`,
      );
    }
    if (input.rows.length === 0 || input.rows.length > LEGACY_IMPORT_MAX_ROWS) {
      throw new BadRequestException(
        `Entre 1 y ${LEGACY_IMPORT_MAX_ROWS} filas por importación.`,
      );
    }

    const customers = await this.prisma.customer.findMany({
      where: { businessId, isActive: true },
      select: { id: true, phoneE164: true, email: true, optedOut: true },
    });
    const byPhone = new Map(customers.map((c) => [c.phoneE164, c]));
    const events = await this.prisma.customerConsentEvent.findMany({
      where: { businessId, channel: input.channel },
      select: { customerId: true, action: true, createdAt: true },
    });
    const eventsBy = new Map<string, typeof events>();
    for (const e of events) {
      const list = eventsBy.get(e.customerId) ?? [];
      list.push(e);
      eventsBy.set(e.customerId, list);
    }

    const accepted: { customerId: string; grantedAt: Date }[] = [];
    const excluded: Partial<Record<LegacyExclusion, number>> = {};
    const exclude = (reason: LegacyExclusion) => {
      excluded[reason] = (excluded[reason] ?? 0) + 1;
    };
    const seen = new Set<string>();

    for (const row of input.rows) {
      let phone: string;
      try {
        phone = normalizeToE164(row.phone);
      } catch {
        exclude('INVALID_PHONE');
        continue;
      }
      const customer = byPhone.get(phone);
      if (!customer) {
        exclude('CUSTOMER_NOT_FOUND');
        continue;
      }
      if (seen.has(customer.id)) {
        exclude('DUPLICATE_ROW');
        continue;
      }
      seen.add(customer.id);
      const grantedAt = new Date(row.grantedAt);
      const dateProblem = legacyGrantedAtProblem(grantedAt, now);
      if (dateProblem) {
        exclude(dateProblem);
        continue;
      }
      const status = effectiveConsent(
        eventsBy.get(customer.id) ?? [],
        input.channel === 'WHATSAPP' ? customer.optedOut : false,
      );
      if (status === 'SUPPRESSED') exclude('SUPPRESSED');
      else if (status === 'REVOKED') exclude('OPTED_OUT_OR_REVOKED');
      else if (status === 'GRANTED') exclude('ALREADY_GRANTED');
      else accepted.push({ customerId: customer.id, grantedAt });
    }

    const summary = {
      channel: input.channel,
      rows: input.rows.length,
      toImport: accepted.length,
      excluded: Object.entries(excluded).map(([reason, count]) => ({
        reason,
        count,
        text: LEGACY_EXCLUSION_TEXT[reason as LegacyExclusion],
      })),
      imported: 0,
      preview: !input.confirm,
    };
    if (!input.confirm || accepted.length === 0) return summary;

    const textVersion = `legacy:${createHash('sha256')
      .update(evidence.consentTextShown.trim())
      .digest('hex')
      .slice(0, 12)}`;
    const note = `Importada. Vía: ${evidence.collectedVia.trim()} | Prueba: ${evidence.documentRef.trim()} | Texto: ${evidence.consentTextShown.trim()}`;
    for (const item of accepted) {
      await this.consent.record({
        businessId,
        customerId: item.customerId,
        channel: input.channel,
        action: ConsentAction.GRANTED,
        source: ConsentSource.LEGACY_IMPORT,
        actorUserId,
        note,
        textVersion,
        occurredAt: item.grantedAt,
      });
    }
    await this.auditLog.log({
      action: 'CONSENT_LEGACY_IMPORT',
      entityType: 'Business',
      entityId: businessId,
      userId: actorUserId,
      businessId,
      metadata: {
        channel: input.channel,
        imported: accepted.length,
        excluded,
        documentRef: evidence.documentRef.trim().slice(0, 200),
        textVersion,
      },
    });
    return { ...summary, imported: accepted.length, preview: false };
  }
}
