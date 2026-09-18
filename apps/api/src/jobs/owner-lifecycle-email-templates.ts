import {
  emailCallout,
  emailParagraph,
  emailSectionLabel,
  emailStats,
  escapeHtml,
  getEmailAppUrl,
  renderEmailLayout,
} from './email-design-system';

export const MERCADOPAGO_CHECKOUT_URL = 'https://mpago.la/1Acxajh';

function insightsUrl(): string {
  return getEmailAppUrl('/dashboard/insights');
}

function flikkerObservation(text: string) {
  return emailCallout({
    label: 'Lo que Flikker ve',
    tone: 'accent',
    contentHtml: escapeHtml(text),
  });
}

export function renderFirstWeekEmail(input: {
  businessName: string;
  newCustomers: number;
  visits: number;
  returningCustomers: number;
  newReviews: number;
  benefitsRedeemed: number;
  lowActivity: boolean;
}) {
  const content = input.lowActivity
    ? emailCallout({
        label: 'Todo está funcionando',
        tone: 'neutral',
        contentHtml:
          'Recién empezás con Flikker — todavía es poca actividad para sacar conclusiones. A medida que sumes clientes y visitas, vas a ver estos números crecer.',
      })
    : emailStats([
        { label: 'Clientes nuevos', value: input.newCustomers },
        { label: 'Visitas', value: input.visits },
        { label: 'Volvieron', value: input.returningCustomers },
        { label: 'Reseñas nuevas', value: input.newReviews },
        ...(input.benefitsRedeemed > 0
          ? [{ label: 'Beneficios canjeados', value: input.benefitsRedeemed }]
          : []),
      ]);

  return {
    subject: 'Tu primera semana con Flikker',
    html: renderEmailLayout({
      preheader: `Primeros resultados de ${input.businessName} en Flikker.`,
      eyebrow: input.businessName,
      title: 'Tu primera semana con Flikker',
      bodyHtml:
        emailParagraph(
          'Este es el primer panorama de la actividad que Flikker registró para tu negocio.',
        ) + content,
      action: { label: 'Ver Insights', url: insightsUrl() },
      businessName: input.businessName,
    }),
  };
}

export function renderWeeklySummaryEmail(input: {
  businessName: string;
  funnel: {
    contacted: number;
    returned: number;
    recoveryRatePercent: number;
  } | null;
  kpis: Array<{ label: string; value: string | number }>;
  aiText: string | null;
}) {
  const funnelHtml = input.funnel
    ? emailParagraph(
        `Flikker contactó a <strong>${input.funnel.contacted}</strong> ${input.funnel.contacted === 1 ? 'cliente inactivo' : 'clientes inactivos'} y <strong>${input.funnel.returned}</strong> ${input.funnel.returned === 1 ? 'volvió' : 'volvieron'} (<strong>${input.funnel.recoveryRatePercent}%</strong> de recuperación).`,
      )
    : '';
  const insight =
    input.aiText ??
    'Estos son los números reales de esta semana — a medida que sumes más actividad, vas a ver patrones más claros acá.';

  return {
    subject: `Así le fue a ${input.businessName} esta semana`,
    html: renderEmailLayout({
      preheader: `Clientes, visitas y resultados de ${input.businessName} esta semana.`,
      eyebrow: `Resumen semanal · ${input.businessName}`,
      title: 'Así te fue esta semana',
      bodyHtml:
        funnelHtml +
        emailStats(input.kpis.slice(0, 4)) +
        flikkerObservation(insight),
      action: { label: 'Ver Insights', url: insightsUrl() },
      businessName: input.businessName,
    }),
  };
}

export function renderMonthlySummaryEmail(input: {
  businessName: string;
  monthLabel: string;
  returningCustomers: number;
  recoveredCustomers: number;
  newCustomers: number;
  newReviews: number;
  benefitsRedeemed: number;
  comparison: { newCustomers: number; returningCustomers: number } | null;
  aiText: string | null;
}) {
  const comparison = input.comparison
    ? emailParagraph(
        `El mes anterior: <strong>${input.comparison.newCustomers} clientes nuevos</strong> y <strong>${input.comparison.returningCustomers} que volvieron</strong>.`,
        { muted: true, small: true },
      )
    : '';
  const insight =
    input.aiText ??
    `Estos son los números reales de ${input.monthLabel} — a medida que sumes más actividad, las comparaciones van a ser más claras.`;

  return {
    subject: `¿Flikker generó valor este mes en ${input.businessName}?`,
    html: renderEmailLayout({
      preheader: `El impacto de Flikker en ${input.businessName} durante ${input.monthLabel}.`,
      eyebrow: input.businessName,
      title: `Tu mes en Flikker: ${input.monthLabel}`,
      bodyHtml:
        emailSectionLabel('Lo que Flikker aportó') +
        emailStats([
          { label: 'Clientes que volvieron', value: input.returningCustomers },
          { label: 'Clientes recuperados', value: input.recoveredCustomers },
          { label: 'Clientes nuevos', value: input.newCustomers },
          { label: 'Reseñas nuevas', value: input.newReviews },
          ...(input.benefitsRedeemed > 0
            ? [{ label: 'Beneficios canjeados', value: input.benefitsRedeemed }]
            : []),
        ]) +
        comparison +
        flikkerObservation(insight),
      action: { label: 'Ver mi mes en Insights', url: insightsUrl() },
      businessName: input.businessName,
    }),
  };
}

export function renderFirstMonthEmail(input: {
  businessName: string;
  registeredCustomers: number;
  returningCustomers: number;
  recoveredCustomers: number;
  benefitsRedeemed: number;
  reviewsSinceFlikker: number;
}) {
  return {
    subject: 'Tu primer mes con Flikker',
    html: renderEmailLayout({
      preheader: `El valor acumulado de tu primer mes con Flikker.`,
      eyebrow: input.businessName,
      title: 'Tu primer mes con Flikker',
      bodyHtml:
        emailParagraph(
          'Este es el valor acumulado desde que empezaste a usar Flikker.',
        ) +
        emailStats([
          { label: 'Clientes registrados', value: input.registeredCustomers },
          { label: 'Clientes que volvieron', value: input.returningCustomers },
          { label: 'Clientes recuperados', value: input.recoveredCustomers },
          {
            label: 'Reseñas desde que usás Flikker',
            value: input.reviewsSinceFlikker,
          },
          ...(input.benefitsRedeemed > 0
            ? [{ label: 'Beneficios canjeados', value: input.benefitsRedeemed }]
            : []),
        ]),
      action: { label: 'Ver Insights', url: insightsUrl() },
      businessName: input.businessName,
    }),
  };
}

export function renderTrialEndingEmail(input: {
  businessName: string;
  daysRemaining: number;
  registeredCustomers: number;
  returningCustomers: number;
  recoveredCustomers: number;
  benefitsRedeemed: number;
}) {
  const dayWord = input.daysRemaining === 1 ? 'día' : 'días';
  return {
    subject: `Tu prueba de Flikker Pro termina en ${input.daysRemaining} ${dayWord}`,
    html: renderEmailLayout({
      preheader: `Te quedan ${input.daysRemaining} ${dayWord} de Flikker Pro. Conservá todo lo que generaste.`,
      eyebrow: input.businessName,
      title: `Tu prueba termina en ${input.daysRemaining} ${dayWord}`,
      bodyHtml:
        emailParagraph(
          'Esto es lo que generaste durante tu prueba de Beneficios:',
        ) +
        emailStats([
          { label: 'Clientes registrados', value: input.registeredCustomers },
          { label: 'Clientes que volvieron', value: input.returningCustomers },
          { label: 'Clientes recuperados', value: input.recoveredCustomers },
          { label: 'Beneficios canjeados', value: input.benefitsRedeemed },
        ]) +
        emailCallout({
          tone: 'warning',
          label: 'Continuidad del servicio',
          contentHtml:
            'Seguí con Flikker Pro por <strong>UYU 1.000/mes</strong> y no perdás nada de esto.',
        }),
      action: {
        label: 'Continuar con Flikker Pro',
        url: MERCADOPAGO_CHECKOUT_URL,
      },
      businessName: input.businessName,
    }),
  };
}

// Los hitos se envían exclusivamente por WhatsApp para no duplicar mensajes.
