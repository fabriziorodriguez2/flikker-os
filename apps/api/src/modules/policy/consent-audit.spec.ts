import {
  buildConsentAudit,
  evidenceCoversChannel,
  legacyGrantedAtProblem,
  type AuditCustomerRow,
  type AuditEventRow,
} from './consent-audit';

const NOW = new Date('2026-11-14T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function customer(
  id: string,
  over: Partial<AuditCustomerRow> = {},
): AuditCustomerRow {
  return {
    id,
    hasPhone: true,
    hasEmail: false,
    optedOut: false,
    lastVisitAt: ago(60),
    linkedToMiFlikker: false,
    ...over,
  };
}
const event = (
  customerId: string,
  action: AuditEventRow['action'],
  source: AuditEventRow['source'] = 'CHECKIN_FORM',
  days = 10,
  channel: AuditEventRow['channel'] = 'WHATSAPP',
): AuditEventRow => ({
  customerId,
  channel,
  action,
  source,
  createdAt: ago(days),
});

describe('buildConsentAudit', () => {
  const audit = buildConsentAudit(
    [
      customer('granted'),
      customer('legacy'),
      customer('revoked'),
      customer('optout-legacy', { optedOut: true }),
      customer('suppressed'),
      customer('never-recent', {
        lastVisitAt: ago(5),
        linkedToMiFlikker: true,
      }),
      customer('never-old'),
      customer('no-phone', { hasPhone: false }),
      customer('email-yes', { hasEmail: true }),
    ],
    [
      event('granted', 'GRANTED'),
      event('legacy', 'GRANTED', 'LEGACY_IMPORT', 300),
      event('revoked', 'GRANTED', 'CHECKIN_FORM', 20),
      event('revoked', 'REVOKED', 'INBOUND_KEYWORD', 5),
      // Una baja por el camino viejo gana sobre un sí registrado.
      event('optout-legacy', 'GRANTED'),
      event('suppressed', 'SUPPRESSED', 'COMPLAINT'),
      event('email-yes', 'GRANTED', 'MI_FLIKKER', 3, 'EMAIL'),
    ],
    NOW,
  );

  it('solo cuenta como autorizado un sí documentado y vigente', () => {
    expect(audit.whatsapp.granted).toBe(2);
    expect(audit.whatsapp.grantedBySource).toEqual({
      CHECKIN_FORM: 1,
      LEGACY_IMPORT: 1,
    });
  });

  it('las bajas (también las viejas, sin evento) y las supresiones quedan afuera', () => {
    expect(audit.whatsapp.revoked).toBe(2);
    expect(audit.whatsapp.suppressed).toBe(1);
  });

  it('separa a quien nunca respondió y dónde se le puede preguntar', () => {
    // never-recent, never-old y email-yes (tiene email, no WhatsApp).
    expect(audit.whatsapp.neverAsked).toBe(3);
    expect(audit.whatsapp.neverAskedVisitedLast30d).toBe(1);
    expect(audit.whatsapp.neverAskedWithMiFlikker).toBe(1);
    expect(audit.whatsapp.noPhone).toBe(1);
  });

  it('el email tiene su propio consentimiento', () => {
    expect(audit.email).toEqual({
      granted: 1,
      revoked: 0,
      neverAsked: 0,
      noEmail: 8,
    });
  });

  it('todos los clientes siguen contados: nadie se pierde por no autorizar', () => {
    expect(audit.customers.active).toBe(9);
  });
});

describe('importación de autorizaciones anteriores', () => {
  const evidence = (text: string) => ({
    collectedVia: 'Planilla firmada en el mostrador',
    documentRef: 'Carpeta Drive /consentimientos/2026',
    consentTextShown: text,
  });

  it('el texto aceptado tiene que cubrir promociones por ese canal', () => {
    const wa = evidence('Acepto recibir promociones del local por WhatsApp.');
    expect(evidenceCoversChannel(wa, 'WHATSAPP')).toBe(true);
    expect(evidenceCoversChannel(wa, 'EMAIL')).toBe(false);
    expect(
      evidenceCoversChannel(
        evidence('Acepto los términos y condiciones.'),
        'WHATSAPP',
      ),
    ).toBe(false);
    expect(
      evidenceCoversChannel(
        evidence('Quiero que me avisen por WhatsApp si hay turnos.'),
        'WHATSAPP',
      ),
    ).toBe(false);
  });

  it('fechas: ni futuras, ni inválidas, ni de hace más de 24 meses', () => {
    expect(legacyGrantedAtProblem(ago(100), NOW)).toBeNull();
    expect(legacyGrantedAtProblem(new Date('2030-01-01'), NOW)).toBe(
      'FUTURE_DATE',
    );
    expect(legacyGrantedAtProblem(new Date('nope'), NOW)).toBe('INVALID_DATE');
    expect(legacyGrantedAtProblem(ago(800), NOW)).toBe('TOO_OLD');
  });
});
