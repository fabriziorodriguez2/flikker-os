/**
 * Templates de los emails de ciclo de vida al dueño/manager (primera semana,
 * semanal CHECKIN_V2, mensual, primer mes, trial por terminar, hitos).
 * Sistema visual propio, distinto de `email-templates.ts` (Notificaciones,
 * cara al cliente) y de `renderWeeklySummaryEmail` en
 * `owner-notifications.worker.ts` (LEGACY, que sigue intacto): fondo
 * gris/lavanda, card blanca, encabezados Syne, texto Montserrat (con
 * fallback de sistema — la mayoría de los clientes de correo ignora
 * @font-face/Google Fonts en el body), botón glosado violeta→periwinkle, un
 * solo CTA, "Powered by Flikker".
 */

const HEADING_FONT = "'Syne', -apple-system, 'Segoe UI', Arial, sans-serif";
const BODY_FONT = "'Montserrat', -apple-system, 'Segoe UI', Arial, sans-serif";
const BG_COLOR = '#F1F0FB';
const CARD_COLOR = '#FFFFFF';
const TEXT_COLOR = '#2B2545';
const MUTED_COLOR = '#726C93';
const ACCENT_FROM = '#8C7CF0';
const ACCENT_TO = '#6B8CF5';

export const MERCADOPAGO_CHECKOUT_URL = 'https://mpago.la/1Acxajh';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function wrapper(input: {
  businessName: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Montserrat:wght@400;600&display=swap" rel="stylesheet">
  <title>Flikker</title>
</head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:${BODY_FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG_COLOR};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="background:${CARD_COLOR};border-radius:20px;padding:36px;">
            <p style="margin:0 0 20px;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED_COLOR};font-family:${BODY_FONT};">${escapeHtml(input.businessName)}</p>
            ${input.bodyHtml}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
              <tr><td style="border-radius:12px;background:linear-gradient(135deg, ${ACCENT_FROM}, ${ACCENT_TO});">
                <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:${BODY_FONT};">${escapeHtml(input.ctaLabel)}</a>
              </td></tr>
            </table>
            <p style="margin:28px 0 0;font-size:12px;color:${MUTED_COLOR};font-family:${BODY_FONT};">Powered by <strong>Flikker</strong></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:${TEXT_COLOR};font-family:${HEADING_FONT};">${escapeHtml(text)}</h1>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${TEXT_COLOR};font-family:${BODY_FONT};">${text}</p>`;
}

function subheading(text: string): string {
  return `<h2 style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED_COLOR};font-family:${BODY_FONT};">${escapeHtml(text)}</h2>`;
}

/** Número en violeta, más grande — mismo criterio pedido para Insights (resaltar números reales). */
function stat(value: string | number, label: string): string {
  return `<td style="padding:0 12px 12px 0;" valign="top">
    <div style="font-size:26px;font-weight:800;color:${ACCENT_FROM};font-family:${HEADING_FONT};">${escapeHtml(String(value))}</div>
    <div style="font-size:12px;color:${MUTED_COLOR};font-family:${BODY_FONT};">${escapeHtml(label)}</div>
  </td>`;
}

function statGrid(
  items: Array<{ label: string; value: string | number }>,
): string {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    rows.push(
      `<tr>${pair.map((item) => stat(item.value, item.label)).join('')}${pair.length === 1 ? '<td></td>' : ''}</tr>`,
    );
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;width:100%;">${rows.join('')}</table>`;
}

function aiCallout(text: string): string {
  return `<div style="background:#F6F4FF;border-left:3px solid ${ACCENT_FROM};border-radius:0 10px 10px 0;padding:14px 18px;margin:0 0 16px;">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${ACCENT_FROM};text-transform:uppercase;letter-spacing:0.06em;font-family:${BODY_FONT};">Lo que Flikker ve ✨</p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${TEXT_COLOR};font-family:${BODY_FONT};">${escapeHtml(text)}</p>
  </div>`;
}

function insightsUrl(): string {
  const base =
    process.env.APP_PUBLIC_URL ??
    process.env.WEB_BASE_URL ??
    'https://app.flikker.com';
  return `${base.replace(/\/$/, '')}/dashboard/insights`;
}

// ---------------------------------------------------------------------------
// 1. Primera semana
// ---------------------------------------------------------------------------

export function renderFirstWeekEmail(input: {
  businessName: string;
  newCustomers: number;
  visits: number;
  returningCustomers: number;
  newReviews: number;
  benefitsRedeemed: number;
  lowActivity: boolean;
}) {
  const body = input.lowActivity
    ? paragraph(
        'Recién empezás con Flikker — todavía es poca actividad para sacar conclusiones, pero ya está todo funcionando. A medida que sumes clientes y visitas, vas a ver estos números crecer.',
      )
    : `${statGrid([
        { label: 'Clientes nuevos', value: input.newCustomers },
        { label: 'Visitas', value: input.visits },
        { label: 'Volvieron', value: input.returningCustomers },
        { label: 'Reseñas nuevas', value: input.newReviews },
        ...(input.benefitsRedeemed > 0
          ? [{ label: 'Beneficios canjeados', value: input.benefitsRedeemed }]
          : []),
      ])}`;

  return {
    subject: 'Tu primera semana con Flikker',
    html: wrapper({
      businessName: input.businessName,
      bodyHtml: `${heading('Tu primera semana con Flikker')}${body}`,
      ctaLabel: 'Ver Insights',
      ctaUrl: insightsUrl(),
    }),
  };
}

// ---------------------------------------------------------------------------
// 2. Semanal (CHECKIN_V2)
// ---------------------------------------------------------------------------

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
    ? paragraph(
        `Flikker contactó a <strong>${input.funnel.contacted}</strong> ${input.funnel.contacted === 1 ? 'cliente inactivo' : 'clientes inactivos'} y <strong>${input.funnel.returned}</strong> ${input.funnel.returned === 1 ? 'volvió' : 'volvieron'} (${input.funnel.recoveryRatePercent}% de recuperación).`,
      )
    : '';
  const kpisHtml = statGrid(input.kpis.slice(0, 4));
  const aiHtml = input.aiText
    ? aiCallout(input.aiText)
    : aiCallout(
        'Estos son los números reales de esta semana — a medida que sumes más actividad, vas a ver patrones más claros acá.',
      );

  return {
    subject: `Así le fue a ${input.businessName} esta semana`,
    html: wrapper({
      businessName: input.businessName,
      bodyHtml: `${heading('Así te fue esta semana')}${funnelHtml}${kpisHtml}${aiHtml}`,
      ctaLabel: 'Ver Insights',
      ctaUrl: insightsUrl(),
    }),
  };
}

// ---------------------------------------------------------------------------
// 3. Mensual
// ---------------------------------------------------------------------------

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
  const kpisHtml = statGrid([
    { label: 'Clientes que volvieron', value: input.returningCustomers },
    { label: 'Clientes recuperados', value: input.recoveredCustomers },
    { label: 'Clientes nuevos', value: input.newCustomers },
    { label: 'Reseñas nuevas', value: input.newReviews },
    ...(input.benefitsRedeemed > 0
      ? [{ label: 'Beneficios canjeados', value: input.benefitsRedeemed }]
      : []),
  ]);
  const comparisonHtml = input.comparison
    ? paragraph(
        `El mes anterior: ${input.comparison.newCustomers} clientes nuevos y ${input.comparison.returningCustomers} que volvieron.`,
      )
    : '';
  const aiHtml = input.aiText
    ? aiCallout(input.aiText)
    : aiCallout(
        `Estos son los números reales de ${input.monthLabel} — a medida que sumes más actividad, las comparaciones van a ser más claras.`,
      );

  return {
    subject: `¿Flikker generó valor este mes en ${input.businessName}?`,
    html: wrapper({
      businessName: input.businessName,
      bodyHtml: `${heading(`Tu mes en Flikker: ${input.monthLabel}`)}${subheading('Lo que Flikker aportó')}${kpisHtml}${comparisonHtml}${aiHtml}`,
      ctaLabel: 'Ver mi mes en Insights',
      ctaUrl: insightsUrl(),
    }),
  };
}

// ---------------------------------------------------------------------------
// 4. Primer mes (acumulado, distinto del mensual recurrente)
// ---------------------------------------------------------------------------

export function renderFirstMonthEmail(input: {
  businessName: string;
  registeredCustomers: number;
  returningCustomers: number;
  recoveredCustomers: number;
  benefitsRedeemed: number;
  reviewsSinceFlikker: number;
}) {
  const kpisHtml = statGrid([
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
  ]);

  return {
    subject: 'Tu primer mes con Flikker',
    html: wrapper({
      businessName: input.businessName,
      bodyHtml: `${heading('Tu primer mes con Flikker')}${paragraph('Este es el valor acumulado desde que empezaste a usar Flikker.')}${kpisHtml}`,
      ctaLabel: 'Ver Insights',
      ctaUrl: insightsUrl(),
    }),
  };
}

// ---------------------------------------------------------------------------
// 5. Trial por terminar
// ---------------------------------------------------------------------------

export function renderTrialEndingEmail(input: {
  businessName: string;
  daysRemaining: number;
  registeredCustomers: number;
  returningCustomers: number;
  recoveredCustomers: number;
  benefitsRedeemed: number;
}) {
  const dayWord = input.daysRemaining === 1 ? 'día' : 'días';
  const kpisHtml = statGrid([
    { label: 'Clientes registrados', value: input.registeredCustomers },
    { label: 'Clientes que volvieron', value: input.returningCustomers },
    { label: 'Clientes recuperados', value: input.recoveredCustomers },
    { label: 'Beneficios canjeados', value: input.benefitsRedeemed },
  ]);

  return {
    subject: `Tu prueba de Flikker Pro termina en ${input.daysRemaining} ${dayWord}`,
    html: wrapper({
      businessName: input.businessName,
      bodyHtml: `${heading(`Tu prueba termina en ${input.daysRemaining} ${dayWord}`)}${paragraph('Esto es lo que generaste durante tu prueba de Beneficios:')}${kpisHtml}${paragraph('Seguí con Flikker Pro por <strong>UYU 1.000/mes</strong> y no perdás nada de esto.')}`,
      ctaLabel: 'Continuar con Flikker Pro',
      ctaUrl: MERCADOPAGO_CHECKOUT_URL,
    }),
  };
}

// Los hitos ("50 clientes", "10 reseñas", ...) ya no viven acá — se
// movieron a WhatsApp (ver `owner-milestone-whatsapp.service.ts`), un canal
// más ocasional/celebratorio que el email. Mandarlos por los dos hubiera
// significado felicitar al dueño dos veces por el mismo logro.
