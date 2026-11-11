import type { Prisma } from '@prisma/client';
import { whatsappConsent } from './policy-usage';

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

/** Código con el que se registra un envío frenado por esta regla. */
export const NO_MARKETING_CONSENT = 'NO_MARKETING_CONSENT';
