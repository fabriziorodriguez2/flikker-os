/** Owner product emails. Same { subject, html } contract as EmailService. */
export interface OwnerEmailAssets {
  logoUrl?: string;
  customerExperienceUrl?: string;
  dashboardUrl?: string;
  scanExperienceUrl?: string;
  qrSupportUrl?: string;
  weeklyHeroUrl?: string;
  benefitExperienceUrl?: string;
}

export interface WeeklyProductReport {
  week_range: string;
  active_customers: number;
  returning_customers: number;
  total_interactions: number;
  new_customers: number;
  recurring_customers?: number;
  top_benefit_name: string | null;
  top_benefit_redemptions: number;
  best_day_name: string | null;
  best_day_count: number;
  days: Array<{ name: string; count: number }>;
}

const font = 'Arial,Helvetica,sans-serif';
const violet = '#7059D9';
function configuredAssets(overrides?: OwnerEmailAssets): OwnerEmailAssets {
  return {
    customerExperienceUrl: process.env.EMAIL_CUSTOMER_EXPERIENCE_URL,
    dashboardUrl: process.env.EMAIL_DASHBOARD_URL,
    scanExperienceUrl: process.env.EMAIL_SCAN_EXPERIENCE_URL,
    weeklyHeroUrl: process.env.EMAIL_WEEKLY_HERO_URL,
    benefitExperienceUrl: process.env.EMAIL_BENEFIT_EXPERIENCE_URL,
    ...overrides,
  };
}
export function emailEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function publicBase(): string {
  return (
    process.env.APP_PUBLIC_URL ??
    process.env.WEB_BASE_URL ??
    'https://app.flikker.com'
  ).replace(/\/$/, '');
}

function safeUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('Email assets and links require HTTP(S) URLs');
  return emailEscape(url.href);
}

function image(url: string | undefined, alt: string, width = 504): string {
  return url
    ? `<img src="${safeUrl(url)}" alt="${emailEscape(alt)}" width="${width}" border="0" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:18px;margin:18px 0;" />`
    : '';
}

function text(value: string): string {
  return `<p style="margin:10px 0 18px;font-size:15px;line-height:1.7;color:#686477;">${value}</p>`;
}

function title(value: string): string {
  return `<h2 style="margin:28px 0 10px;font-size:21px;line-height:1.35;color:#2B2545;">${emailEscape(value)}</h2>`;
}

function panel(body: string, color = '#F4F1FD'): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${color}" style="padding:24px;border-radius:20px;">${body}</td></tr></table>`;
}

function shell(input: {
  businessName: string;
  title: string;
  preheader: string;
  body: string;
  cta: string;
  url: string;
  assets?: OwnerEmailAssets;
}): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${emailEscape(input.title)}</title></head>
<body style="margin:0;padding:0;background:#F7F6FA;font-family:${font};color:#2B2545;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${emailEscape(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F6FA"><tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;"><tr><td bgcolor="#FFFFFF" style="padding:30px 24px;border-radius:24px;box-shadow:0 8px 32px #EDEAF3;">
<img src="${safeUrl(input.assets?.logoUrl ?? `${publicBase()}/flikker-email-logo.png`)}" alt="Flikker" width="126" border="0" style="display:block;width:126px;height:auto;border:0;margin:0 0 24px;">
<p style="margin:0 0 10px;font-size:12px;color:#8B849B;">${emailEscape(input.businessName)}</p>
<h1 style="margin:0 0 12px;font-size:32px;line-height:1.2;letter-spacing:-1px;">${emailEscape(input.title)}</h1>
${input.body}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:28px;"><tr><td bgcolor="${violet}" align="center" style="border-radius:14px;mso-padding-alt:17px 24px;"><a href="${safeUrl(input.url)}" style="display:block;padding:17px 24px;font-family:${font};font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">${emailEscape(input.cta)}</a></td></tr></table>
${text('¿Necesitás una mano? Contactá al equipo de Flikker. Estamos para acompañarte.')}
<p style="margin:24px 0 0;border-top:1px solid #EEEAF5;padding-top:18px;font-size:12px;color:#8B849B;">Flikker · Más motivos para volver.</p>
</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
}

export function renderWelcomeEmail(input: {
  businessName: string;
  configurationUrl?: string;
  assets?: OwnerEmailAssets;
}) {
  input = { ...input, assets: configuredAssets(input.assets) };
  const steps = [
    [
      'Configurá tu experiencia',
      'Revisá tu programa de sellos y los beneficios que querés ofrecer.',
      input.assets?.dashboardUrl,
      'Dashboard real del negocio',
    ],
    [
      'Hacé una prueba',
      'Escaneá el QR de tu negocio y recorré la experiencia como un cliente.',
      input.assets?.scanExperienceUrl,
      'Prueba de escaneo y experiencia del cliente',
    ],
    [
      'Lanzalo en tu negocio',
      'Ubicá el soporte QR/NFC en un lugar visible e invitá a tus clientes a sumar visitas.',
      input.assets?.qrSupportUrl ?? `${publicBase()}/qr-nfc-support.png`,
      'Soporte real QR y NFC de Flikker',
    ],
  ];
  return {
    subject: 'Bienvenido a Flikker 👋',
    html: shell({
      ...input,
      title: 'Bienvenido a Flikker 👋',
      preheader:
        'Tu negocio acaba de dar un paso para que más clientes vuelvan.',
      cta: 'Configurar mi Flikker',
      url: input.configurationUrl ?? `${publicBase()}/dashboard`,
      body: `${text('Tu negocio acaba de dar un paso para que más clientes vuelvan.')}${image(input.assets?.customerExperienceUrl, 'La experiencia real de tus clientes en Flikker')}${panel(['Más clientes que regresan', 'Beneficios que fidelizan', 'Todo en una sola plataforma'].map((label) => `<p style="margin:8px 0;font-size:15px;font-weight:bold;color:#5946AC;">✓ &nbsp;${label}</p>`).join(''))}${title('Empezá por acá')}${text('Tres pasos para empezar')}${steps.map(([label, description, url, alt], index) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td style="padding:20px;border:1px solid #EEEAF5;border-radius:20px;"><p style="margin:0 0 10px;font-size:12px;font-weight:bold;color:${violet};">PASO ${index + 1}</p><h3 style="margin:0;font-size:18px;">${label}</h3>${text(description!)}${image(url, alt!, 464)}</td></tr></table>`).join('')}`,
    }),
  };
}

export function renderWeeklyProductEmail(input: {
  businessName: string;
  report: WeeklyProductReport;
  assets?: OwnerEmailAssets;
}) {
  input = { ...input, assets: configuredAssets(input.assets) };
  const r = input.report;
  const metric = (value: number, label: string) =>
    `<td width="33%" valign="top" style="padding:20px 6px;text-align:center;"><p style="margin:0;font-size:30px;font-weight:bold;color:${violet};">${value}</p><p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#686477;">${label}</p></td>`;
  const max = Math.max(1, ...r.days.map((day) => day.count));
  const chart = r.days.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${r.days
        .map((day) => {
          const height = Math.round((day.count / max) * 76);
          const highlight = day.count > 0 && day.count === max;
          return `<td align="center" valign="bottom" style="padding:0 3px;font-size:11px;"><p style="margin:0 0 6px;color:#686477;">${day.count}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="${Math.max(2, height)}" bgcolor="${highlight ? violet : '#DCD4F5'}" style="height:${Math.max(2, height)}px;border-radius:7px 7px 0 0;font-size:1px;line-height:1px;">&nbsp;</td></tr></table><p style="margin:8px 0 0;color:${highlight ? violet : '#686477'};">${emailEscape(day.name)}</p></td>`;
        })
        .join('')}</tr></table>`
    : '';
  return {
    subject: 'Tu semana en Flikker',
    html: shell({
      ...input,
      title: 'Tu semana en Flikker',
      preheader: `${r.week_range} · ${r.active_customers} clientes participaron esta semana.`,
      cta: 'Ver todas mis estadísticas',
      url: `${publicBase()}/dashboard/insights`,
      body: `${text(emailEscape(r.week_range))}${panel(`${image(input.assets?.weeklyHeroUrl, 'Un momento en tu negocio')}<p style="margin:0;font-size:25px;font-weight:bold;line-height:1.4;">Esta semana <span style="color:${violet};">${r.active_customers} clientes</span> interactuaron con tu negocio</p>`)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${metric(r.active_customers, 'clientes participaron')}${metric(r.returning_customers, 'clientes volvieron')}${metric(r.total_interactions, 'interacciones registradas')}</tr></table>${title('Tus clientes esta semana')}${panel(`<p style="margin:0;font-size:26px;color:${violet};font-weight:bold;">+${r.new_customers}</p>${text('nuevos clientes se sumaron a Flikker')}${r.recurring_customers !== undefined ? text(`${r.recurring_customers} clientes registraron más de una visita esta semana.`) : ''}`, '#FAF9FC')}${title('El beneficio que más movió a tus clientes')}${r.top_benefit_name ? panel(`<h3 style="margin:0;font-size:20px;">${emailEscape(r.top_benefit_name)}</h3>${text(`${r.top_benefit_redemptions} canjes esta semana`)}${image(input.assets?.benefitExperienceUrl, 'El beneficio en la experiencia real del cliente', 456)}`) : text('Esta semana todavía no se registraron canjes.')}${title('Tu mejor día')}${r.best_day_name ? `${text(`<strong>${emailEscape(r.best_day_name)}</strong> · ${r.best_day_count} interacciones registradas`)}${chart}` : text('Todavía no hay visitas registradas para destacar un día.')}${title(`Esta semana hiciste que ${r.returning_customers} clientes volvieran.`)}${text('Cada visita es una nueva oportunidad para construir una relación con tu negocio.')}`,
    }),
  };
}
