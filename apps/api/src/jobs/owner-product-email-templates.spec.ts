import {
  renderWelcomeEmail,
  renderWeeklyProductEmail,
  type WeeklyProductReport,
} from './owner-product-email-templates';

const report: WeeklyProductReport = {
  week_range: '21–27 sep 2026',
  active_customers: 42,
  returning_customers: 18,
  total_interactions: 68,
  new_customers: 12,
  recurring_customers: 9,
  top_benefit_name: 'Café & medialuna',
  top_benefit_redemptions: 7,
  best_day_name: 'vie',
  best_day_count: 20,
  days: [
    { name: 'lun', count: 0 },
    { name: 'vie', count: 20 },
  ],
};

describe('owner product emails', () => {
  it('escapes names and remote URLs without inventing customer screens', () => {
    const { html } = renderWelcomeEmail({
      businessName: '<script>alert(1)</script>',
      assets: { dashboardUrl: 'https://cdn.example.com/dashboard.png?a=1&b=2' },
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('dashboard.png?a=1&amp;b=2');
    expect(html).toContain('flikker-email-logo.png');
    expect(html).toContain('qr-nfc-support.png');
    expect(html).not.toContain('iphone-mockup');
  });

  it('rejects non HTTP(S) asset and CTA URLs', () => {
    expect(() =>
      renderWelcomeEmail({
        businessName: 'Café',
        configurationUrl: 'javascript:alert(1)',
      }),
    ).toThrow();
  });

  it('uses real supplied metrics and escapes benefit names', () => {
    const { subject, html } = renderWeeklyProductEmail({
      businessName: 'Café',
      report,
    });
    expect(subject).toBe('Tu semana en Flikker');
    expect(html).toContain('42 clientes');
    expect(html).toContain('Café &amp; medialuna');
    expect(html).toContain('7 canjes');
    expect(html).toContain('20 interacciones');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('<svg');
  });

  it('handles an inactive week without a fabricated benefit or best day', () => {
    const { html } = renderWeeklyProductEmail({
      businessName: 'Café',
      report: {
        ...report,
        active_customers: 0,
        returning_customers: 0,
        top_benefit_name: null,
        best_day_name: null,
        days: [],
      },
    });
    expect(html).toContain('todavía no se registraron canjes');
    expect(html).toContain('Todavía no hay visitas');
    expect(html).not.toContain('height="NaN"');
  });
});
