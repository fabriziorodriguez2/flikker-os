import {
  MERCADOPAGO_CHECKOUT_URL,
  renderFirstMonthEmail,
  renderFirstWeekEmail,
  renderMilestoneEmail,
  renderMonthlySummaryEmail,
  renderTrialEndingEmail,
  renderWeeklySummaryEmail,
} from './owner-lifecycle-email-templates';

describe('renderFirstWeekEmail', () => {
  it('con poca actividad muestra la rama positiva, sin números de KPI', () => {
    const { html } = renderFirstWeekEmail({
      businessName: 'Café Test',
      newCustomers: 1,
      visits: 1,
      returningCustomers: 0,
      newReviews: 0,
      benefitsRedeemed: 0,
      lowActivity: true,
    });
    expect(html).toContain('Recién empezás');
    expect(html).not.toContain('Clientes nuevos');
  });

  it('con actividad real muestra los números exactos que se le pasaron', () => {
    const { html } = renderFirstWeekEmail({
      businessName: 'Café Test',
      newCustomers: 12,
      visits: 30,
      returningCustomers: 4,
      newReviews: 3,
      benefitsRedeemed: 0,
      lowActivity: false,
    });
    expect(html).toContain('12');
    expect(html).toContain('30');
    expect(html).toContain('4');
    expect(html).toContain('3');
  });
});

describe('renderWeeklySummaryEmail', () => {
  it('omite la línea de funnel cuando no hubo contactados', () => {
    const { html } = renderWeeklySummaryEmail({
      businessName: 'Café Test',
      funnel: null,
      kpis: [{ label: 'Visitas', value: 10 }],
      aiText: null,
    });
    expect(html).not.toContain('contactó');
  });

  it('muestra la línea de funnel exacta cuando hubo contactados', () => {
    const { html } = renderWeeklySummaryEmail({
      businessName: 'Café Test',
      funnel: { contacted: 24, returned: 7, recoveryRatePercent: 29.2 },
      kpis: [{ label: 'Visitas', value: 10 }],
      aiText: null,
    });
    expect(html).toContain('24');
    expect(html).toContain('7');
    expect(html).toContain('29.2');
  });

  it('nunca muestra más de 4 KPIs aunque se le pasen más', () => {
    const kpis = [
      { label: 'A', value: 1 },
      { label: 'B', value: 2 },
      { label: 'C', value: 3 },
      { label: 'D', value: 4 },
      { label: 'E', value: 5 },
    ];
    const { html } = renderWeeklySummaryEmail({
      businessName: 'Café Test',
      funnel: null,
      kpis,
      aiText: null,
    });
    expect(html).not.toContain('>E<');
    expect(html.match(/Café Test/g)?.length).toBeGreaterThan(0);
  });

  it('usa la línea estática cuando no hay texto de IA — nunca deja la sección vacía', () => {
    const { html } = renderWeeklySummaryEmail({
      businessName: 'Café Test',
      funnel: null,
      kpis: [],
      aiText: null,
    });
    expect(html).toContain('Lo que Flikker ve');
    expect(html).toContain('números reales');
  });
});

describe('renderMonthlySummaryEmail', () => {
  it('omite la comparación cuando no se pasa (mes anterior sin data suficiente)', () => {
    const { html } = renderMonthlySummaryEmail({
      businessName: 'Café Test',
      monthLabel: 'agosto de 2026',
      returningCustomers: 5,
      recoveredCustomers: 2,
      newCustomers: 3,
      newReviews: 1,
      benefitsRedeemed: 0,
      comparison: null,
      aiText: null,
    });
    expect(html).not.toContain('mes anterior');
  });

  it('muestra la comparación exacta cuando se pasa', () => {
    const { html } = renderMonthlySummaryEmail({
      businessName: 'Café Test',
      monthLabel: 'agosto de 2026',
      returningCustomers: 5,
      recoveredCustomers: 2,
      newCustomers: 3,
      newReviews: 1,
      benefitsRedeemed: 0,
      comparison: { newCustomers: 8, returningCustomers: 6 },
      aiText: null,
    });
    expect(html).toContain('8 clientes nuevos');
    expect(html).toContain('6 que volvieron');
  });
});

describe('renderTrialEndingEmail', () => {
  it('el CTA apunta al checkout real de Mercado Pago', () => {
    const { html } = renderTrialEndingEmail({
      businessName: 'Café Test',
      daysRemaining: 5,
      registeredCustomers: 10,
      returningCustomers: 4,
      recoveredCustomers: 1,
      benefitsRedeemed: 2,
    });
    expect(html).toContain(MERCADOPAGO_CHECKOUT_URL);
    expect(html).toContain('UYU 1.000/mes');
  });
});

describe('renderFirstMonthEmail', () => {
  it('muestra los números acumulados exactos', () => {
    const { html } = renderFirstMonthEmail({
      businessName: 'Café Test',
      registeredCustomers: 40,
      returningCustomers: 15,
      recoveredCustomers: 3,
      benefitsRedeemed: 5,
      reviewsSinceFlikker: 8,
    });
    expect(html).toContain('40');
    expect(html).toContain('15');
    expect(html).toContain('3');
    expect(html).toContain('8');
  });
});

describe('renderMilestoneEmail', () => {
  it('arma un subject con el nombre del negocio y el hito', () => {
    const { subject } = renderMilestoneEmail({
      businessName: 'Café Test',
      milestoneKey: 'customers_100',
    });
    expect(subject).toContain('Café Test');
    expect(subject).toContain('100 clientes');
  });
});
