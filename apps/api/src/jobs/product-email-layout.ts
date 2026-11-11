import { escapeHtml, getEmailAppUrl } from './email-design-system';
import type { EmailAction } from './email-design-system';

/** Visual tokens extracted from the existing weekly product report. */
export const PRODUCT_EMAIL = {
  font: 'Arial,Helvetica,sans-serif',
  width: 600,
  background: '#F7F6FA',
  surface: '#FFFFFF',
  accent: '#7059D9',
  accentSoft: '#F4F1FD',
  secondarySurface: '#FAF9FC',
  text: '#2B2545',
  muted: '#686477',
  subtle: '#8B849B',
  border: '#EEEAF5',
  chart: '#DCD4F5',
  radius: 24,
  cardRadius: 20,
  buttonRadius: 14,
} as const;

export const PRODUCT_EMAIL_FOOTER = 'Flikker · Más motivos para volver.';
export const PRODUCT_EMAIL_SUPPORT =
  '¿Necesitás una mano? Contactá al equipo de Flikker. Estamos para acompañarte.';

export function productEmailUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('Email assets and links require HTTP(S) URLs');
  return escapeHtml(value);
}

/** Content arguments are already escaped HTML; labels and layout data are raw. */
export function productEmailParagraph(contentHtml: string): string {
  return `<p style="margin:10px 0 18px;font-family:${PRODUCT_EMAIL.font};font-size:15px;line-height:1.7;color:${PRODUCT_EMAIL.muted};">${contentHtml}</p>`;
}

export function productEmailHeading(label: string): string {
  return `<h2 style="margin:28px 0 10px;font-family:${PRODUCT_EMAIL.font};font-size:21px;line-height:1.35;color:${PRODUCT_EMAIL.text};">${escapeHtml(label)}</h2>`;
}

export function productEmailLabel(label: string): string {
  return `<p style="margin:0 0 10px;font-family:${PRODUCT_EMAIL.font};font-size:11px;line-height:1.4;font-weight:bold;letter-spacing:0.1em;text-transform:uppercase;color:${PRODUCT_EMAIL.accent};">${escapeHtml(label)}</p>`;
}

export function productEmailCard(
  contentHtml: string,
  color: string = PRODUCT_EMAIL.accentSoft,
): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="email-card" bgcolor="${color}" style="padding:24px;border-radius:${PRODUCT_EMAIL.cardRadius}px;">${contentHtml}</td></tr></table>`;
}

export function productEmailButton(action: EmailAction): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:28px 0 0;"><tr><td bgcolor="${PRODUCT_EMAIL.accent}" align="center" style="border-radius:${PRODUCT_EMAIL.buttonRadius}px;mso-padding-alt:17px 24px;"><a href="${productEmailUrl(action.url)}" style="display:block;padding:17px 24px;font-family:${PRODUCT_EMAIL.font};font-size:15px;line-height:1.2;font-weight:bold;color:${PRODUCT_EMAIL.surface};text-decoration:none;border-radius:${PRODUCT_EMAIL.buttonRadius}px;">${escapeHtml(action.label)}</a></td></tr></table>`;
}

export function renderProductEmailLayout(input: {
  title: string;
  preheader: string;
  bodyHtml: string;
  action: EmailAction;
  eyebrow?: string;
  businessName?: string;
  logoUrl?: string;
  afterActionHtml?: string;
  support?: boolean;
}): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(input.title)}</title>
<style type="text/css">
  @media only screen and (max-width: 620px) {
    .email-outer { padding:20px 8px !important; }
    .email-content { padding:26px 20px !important; }
    .email-card { padding:20px !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:${PRODUCT_EMAIL.background};font-family:${PRODUCT_EMAIL.font};color:${PRODUCT_EMAIL.text};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PRODUCT_EMAIL.background}"><tr><td class="email-outer" align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="${PRODUCT_EMAIL.width}" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table class="email-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${PRODUCT_EMAIL.width}px;"><tr><td class="email-content" bgcolor="${PRODUCT_EMAIL.surface}" style="padding:30px 24px;border-radius:${PRODUCT_EMAIL.radius}px;">
<img src="${productEmailUrl(input.logoUrl ?? getEmailAppUrl('/flikker-email-logo.png'))}" alt="Flikker" width="126" border="0" style="display:block;width:126px;max-width:100%;height:auto;border:0;margin:0 0 24px;">
${input.businessName ? `<p style="margin:0 0 10px;font-size:12px;color:${PRODUCT_EMAIL.subtle};">${escapeHtml(input.businessName)}</p>` : ''}
${input.eyebrow ? productEmailLabel(input.eyebrow) : ''}
<h1 style="margin:0 0 12px;font-family:${PRODUCT_EMAIL.font};font-size:32px;line-height:1.2;letter-spacing:-1px;color:${PRODUCT_EMAIL.text};">${escapeHtml(input.title)}</h1>
${input.bodyHtml}
${productEmailButton(input.action)}
${input.afterActionHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-top:28px;">${input.afterActionHtml}</td></tr></table>` : ''}
${input.support ? productEmailParagraph(PRODUCT_EMAIL_SUPPORT) : ''}
<p style="margin:24px 0 0;border-top:1px solid ${PRODUCT_EMAIL.border};padding-top:18px;font-family:${PRODUCT_EMAIL.font};font-size:12px;line-height:1.6;color:${PRODUCT_EMAIL.subtle};">${PRODUCT_EMAIL_FOOTER}</p>
</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
}
