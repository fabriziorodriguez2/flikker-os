import {
  birthdayEmail,
  promotionEmail,
  retentionMessageEmail,
  stampsExpiryEmail,
} from './email-templates';

describe('customer email templates', () => {
  it('muestra premio, vencimiento y código sin exponer HTML', () => {
    const result = stampsExpiryEmail({
      businessName: 'Café Central',
      customerName: '<Ana>',
      rewardName: 'Café gratis',
      daysRemaining: 2,
      redemptionCode: 'ABC-123',
    });
    expect(result.subject).toContain('vence en 2 días');
    expect(result.html).toContain('ABC-123');
    expect(result.html).toContain('&lt;Ana&gt;');
  });

  it('diferencia progreso de reactivación y conserva el mensaje aprobado', () => {
    const progress = retentionMessageEmail({
      businessName: 'Café Central',
      customerName: 'Ana',
      messageBody: 'Te falta una visita.\nVolvé pronto.',
      isProgressReminder: true,
    });
    const recovery = retentionMessageEmail({
      businessName: 'Café Central',
      customerName: 'Ana',
      messageBody: 'Te extrañamos.',
      isProgressReminder: false,
    });
    expect(progress.subject).toContain('casi');
    expect(progress.html).toContain('Te falta una visita.<br />Volvé pronto.');
    expect(recovery.subject).toContain('Café Central');
  });

  it('usa fallback de CTA cuando una promoción no trae link', () => {
    const result = promotionEmail({
      businessName: 'Café Central',
      customerName: 'Ana',
      messageBody: 'Tenemos novedades',
      benefitTitle: null,
      checkinLink: null,
    });
    expect(result.subject).toBe('Novedades de Café Central');
    expect(result.html).toContain('Ir a Mi Flikker');
  });

  it('mantiene una versión válida para cumpleaños', () => {
    const result = birthdayEmail({
      businessName: 'Café Central',
      customerName: 'Ana',
    });
    expect(result.subject).toContain('Feliz cumpleaños');
    expect(result.html).toContain('Gracias por elegirnos');
  });
});
