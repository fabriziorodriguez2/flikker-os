import { escapeHtml, getEmailAppUrl } from './email-design-system';
import {
  PRODUCT_EMAIL,
  productEmailCard as panel,
  productEmailHeading as title,
  productEmailParagraph as text,
  productEmailUrl as safeUrl,
  renderProductEmailLayout,
} from './product-email-layout';

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

const violet = PRODUCT_EMAIL.accent;
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
  return escapeHtml(value);
}

function publicBase(): string {
  return getEmailAppUrl();
}

function image(url: string | undefined, alt: string, width = 504): string {
  return url
    ? `<img src="${safeUrl(url)}" alt="${emailEscape(alt)}" width="${width}" border="0" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:18px;margin:18px 0;" />`
    : '';
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
  return renderProductEmailLayout({
    title: input.title,
    preheader: input.preheader,
    businessName: input.businessName,
    bodyHtml: input.body,
    action: { label: input.cta, url: input.url },
    logoUrl: input.assets?.logoUrl,
    support: true,
  });
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
      body: `${text('Tu negocio acaba de dar un paso para que más clientes vuelvan.')}${image(input.assets?.customerExperienceUrl, 'La experiencia real de tus clientes en Flikker')}${panel(['Más clientes que regresan', 'Beneficios que fidelizan', 'Todo en una sola plataforma'].map((label) => `<p style="margin:8px 0;font-size:15px;font-weight:bold;color:${PRODUCT_EMAIL.accent};">✓ &nbsp;${label}</p>`).join(''))}${title('Empezá por acá')}${text('Tres pasos para empezar')}${steps.map(([label, description, url, alt], index) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td style="padding:20px;border:1px solid ${PRODUCT_EMAIL.border};border-radius:20px;"><p style="margin:0 0 10px;font-size:12px;font-weight:bold;color:${violet};">PASO ${index + 1}</p><h3 style="margin:0;font-size:18px;">${label}</h3>${text(description!)}${image(url, alt!, 464)}</td></tr></table>`).join('')}`,
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
    `<td width="33%" valign="top" style="padding:20px 6px;text-align:center;"><p style="margin:0;font-size:30px;font-weight:bold;color:${violet};">${value}</p><p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:${PRODUCT_EMAIL.muted};">${label}</p></td>`;
  const max = Math.max(1, ...r.days.map((day) => day.count));
  const chart = r.days.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${r.days
        .map((day) => {
          const height = Math.round((day.count / max) * 76);
          const highlight = day.count > 0 && day.count === max;
          return `<td align="center" valign="bottom" style="padding:0 3px;font-size:11px;"><p style="margin:0 0 6px;color:${PRODUCT_EMAIL.muted};">${day.count}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="${Math.max(2, height)}" bgcolor="${highlight ? violet : PRODUCT_EMAIL.chart}" style="height:${Math.max(2, height)}px;border-radius:7px 7px 0 0;font-size:1px;line-height:1px;">&nbsp;</td></tr></table><p style="margin:8px 0 0;color:${highlight ? violet : PRODUCT_EMAIL.muted};">${emailEscape(day.name)}</p></td>`;
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
      body: `${text(emailEscape(r.week_range))}${panel(`${image(input.assets?.weeklyHeroUrl, 'Un momento en tu negocio')}<p style="margin:0;font-size:25px;font-weight:bold;line-height:1.4;">Esta semana <span style="color:${violet};">${r.active_customers} clientes</span> interactuaron con tu negocio</p>`)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${metric(r.active_customers, 'clientes participaron')}${metric(r.returning_customers, 'clientes volvieron')}${metric(r.total_interactions, 'interacciones registradas')}</tr></table>${title('Tus clientes esta semana')}${panel(`<p style="margin:0;font-size:26px;color:${violet};font-weight:bold;">+${r.new_customers}</p>${text('nuevos clientes se sumaron a Flikker')}${r.recurring_customers !== undefined ? text(`${r.recurring_customers} clientes registraron más de una visita esta semana.`) : ''}`, PRODUCT_EMAIL.secondarySurface)}${title('El beneficio que más movió a tus clientes')}${r.top_benefit_name ? panel(`<h3 style="margin:0;font-size:20px;">${emailEscape(r.top_benefit_name)}</h3>${text(`${r.top_benefit_redemptions} canjes esta semana`)}${image(input.assets?.benefitExperienceUrl, 'El beneficio en la experiencia real del cliente', 456)}`) : text('Esta semana todavía no se registraron canjes.')}${title('Tu mejor día')}${r.best_day_name ? `${text(`<strong>${emailEscape(r.best_day_name)}</strong> · ${r.best_day_count} interacciones registradas`)}${chart}` : text('Todavía no hay visitas registradas para destacar un día.')}${title(`Esta semana hiciste que ${r.returning_customers} clientes volvieran.`)}${text('Cada visita es una nueva oportunidad para construir una relación con tu negocio.')}`,
    }),
  };
}
