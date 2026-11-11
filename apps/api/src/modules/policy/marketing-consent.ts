import type { Prisma } from '@prisma/client';
import { whatsappConsent } from './policy-usage';
import { effectiveConsent } from './policy-rules';

type Db = Prisma.TransactionClient;

/**
 * Regla única para los envíos promocionales AUTOMÁTICOS por WhatsApp
 * (Autopilot, reactivación legacy, recordatorios de repetición, cumpleaños y
 * sellos por vencer): solo salen a quien tiene consentimiento de WhatsApp
 * vigente (GRANTED en el registro de consentimiento).
 *
 * Vale con o sin política aceptada. No haberse dado de baja NO es
 * autorización, y una baja (o supresión) gana siempre sobre un GRANTED.
 *
 * Quedan afuera, a propósito, los mensajes que responden a algo que hizo el
 * cliente (bienvenida del check-in, premio desbloqueado, respuestas a un
 * mensaje entrante, turnos) y los que manda el dueño a mano.
 */
export async function customersWithWhatsappMarketingConsent(
  db: Db,
  businessId: string,
  customerIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(customerIds)];
  const consent = await whatsappConsent(db, businessId, unique);
  return new Set(unique.filter((id) => consent.get(id) === 'GRANTED'));
}

export async function hasWhatsappMarketingConsent(
  db: Db,
  businessId: string,
  customerId: string,
): Promise<boolean> {
  const allowed = await customersWithWhatsappMarketingConsent(db, businessId, [
    customerId,
  ]);
  return allowed.has(customerId);
}

/**
 * Mismo criterio para el email promocional (cumpleaños, sellos por vencer,
 * email de Autopilot, promociones manuales): solo con un GRANTED de EMAIL
 * vigente. El consentimiento de WhatsApp no cubre el email ni al revés.
 */
export async function customersWithEmailMarketingConsent(
  db: Db,
  businessId: string,
  customerIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(customerIds)];
  if (unique.length === 0) return new Set();
  const events = await db.customerConsentEvent.findMany({
    where: { businessId, customerId: { in: unique }, channel: 'EMAIL' },
    select: { customerId: true, action: true, createdAt: true },
  });
  const byCustomer = new Map<string, typeof events>();
  for (const e of events) {
    const list = byCustomer.get(e.customerId) ?? [];
    list.push(e);
    byCustomer.set(e.customerId, list);
  }
  return new Set(
    unique.filter(
      (id) => effectiveConsent(byCustomer.get(id) ?? [], false) === 'GRANTED',
    ),
  );
}

export async function hasEmailMarketingConsent(
  db: Db,
  businessId: string,
  customerId: string,
): Promise<boolean> {
  return (
    await customersWithEmailMarketingConsent(db, businessId, [customerId])
  ).has(customerId);
}

/** Código con el que se registra un envío frenado por esta regla. */
export const NO_MARKETING_CONSENT = 'NO_MARKETING_CONSENT';
