export const EMAIL_COLORS = {
  accent: '#5C6BC0',
  accentDark: '#4653A3',
  accentSoft: '#EEF0FB',
  background: '#F5F6FA',
  border: '#E5E7EF',
  text: '#17162E',
  muted: '#686A7D',
  success: '#147D64',
  successSoft: '#EAF8F3',
  warning: '#A45B09',
  warningSoft: '#FFF6E8',
  danger: '#B33A45',
  dangerSoft: '#FFF0F1',
} as const;

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

export type EmailTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export interface EmailAction {
  label: string;
  url: string;
}

export function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function getEmailAppUrl(path = ''): string {
  const base = (
    process.env.APP_PUBLIC_URL ??
    process.env.WEB_BASE_URL ??
    process.env.WEB_PUBLIC_URL ??
    'https://app.flikker.com'
  ).replace(/\/$/, '');
  return `${base}${path.startsWith('/') || !path ? path : `/${path}`}`;
}

export function getEmailAssetUrl(path: string): string {
  return getEmailAppUrl(path);
}

export function emailParagraph(
  contentHtml: string,
  options: { muted?: boolean; small?: boolean } = {},
): string {
  return `<p style="margin:0 0 18px;font-family:${FONT_STACK};font-size:${options.small ? '13px' : '16px'};line-height:1.65;color:${options.muted ? EMAIL_COLORS.muted : EMAIL_COLORS.text};">${contentHtml}</p>`;
}

export function emailSectionLabel(label: string): string {
  return `<p style="margin:28px 0 12px;font-family:${FONT_STACK};font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.11em;text-transform:uppercase;color:${EMAIL_COLORS.muted};">${escapeHtml(label)}</p>`;
}

export function emailDivider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height:1px;background:${EMAIL_COLORS.border};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

function tonePalette(tone: EmailTone) {
  if (tone === 'success')
    return {
      background: EMAIL_COLORS.successSoft,
      border: '#BCE7D8',
      color: EMAIL_COLORS.success,
    };
  if (tone === 'warning')
    return {
      background: EMAIL_COLORS.warningSoft,
      border: '#F4D6A5',
      color: EMAIL_COLORS.warning,
    };
  if (tone === 'danger')
    return {
      background: EMAIL_COLORS.dangerSoft,
      border: '#F2C4C9',
      color: EMAIL_COLORS.danger,
    };
  if (tone === 'neutral')
    return {
      background: '#F8F8FB',
      border: EMAIL_COLORS.border,
      color: EMAIL_COLORS.text,
    };
  return {
    background: EMAIL_COLORS.accentSoft,
    border: '#CDD2F2',
    color: EMAIL_COLORS.accentDark,
  };
}

export function emailCallout(input: {
  label?: string;
  contentHtml: string;
  tone?: EmailTone;
}): string {
  const palette = tonePalette(input.tone ?? 'accent');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="padding:16px 18px;background:${palette.background};border:1px solid ${palette.border};border-radius:10px;font-family:${FONT_STACK};color:${EMAIL_COLORS.text};">
    ${input.label ? `<p style="margin:0 0 6px;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${palette.color};">${escapeHtml(input.label)}</p>` : ''}
    <div style="font-size:14px;line-height:1.6;color:${EMAIL_COLORS.text};">${input.contentHtml}</div>
  </td></tr></table>`;
}

export function emailCode(value: string, label = 'Código de canje'): string {
  return `${emailSectionLabel(label)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td align="center" style="padding:18px;background:${EMAIL_COLORS.accentSoft};border:1px dashed #B7BDE8;border-radius:10px;font-family:${FONT_STACK};font-size:24px;line-height:1.2;font-weight:800;letter-spacing:0.14em;color:${EMAIL_COLORS.accentDark};">${escapeHtml(value)}</td></tr></table>`;
}

export function emailStats(
  items: Array<{
    label: string;
    value: string | number;
    detail?: string;
  }>,
): string {
  if (items.length === 0) return '';
  const cells = items
    .map(
      (
        item,
      ) => `<td class="metric-cell" width="50%" valign="top" style="width:50%;padding:8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px;background:#F8F8FB;border:1px solid ${EMAIL_COLORS.border};border-radius:10px;font-family:${FONT_STACK};">
          <div style="font-size:26px;line-height:1.1;font-weight:800;color:${EMAIL_COLORS.accentDark};">${escapeHtml(item.value)}</div>
          <div style="margin-top:7px;font-size:12px;line-height:1.45;color:${EMAIL_COLORS.muted};">${escapeHtml(item.label)}</div>
          ${item.detail ? `<div style="margin-top:6px;font-size:11px;line-height:1.4;color:${EMAIL_COLORS.muted};">${escapeHtml(item.detail)}</div>` : ''}
        </td></tr></table>
      </td>`,
    )
    .reduce<string[]>((rows, cell, index) => {
      const rowIndex = Math.floor(index / 2);
      rows[rowIndex] = (rows[rowIndex] ?? '') + cell;
      return rows;
    }, [])
    .map(
      (row) =>
        `<tr>${row}${(row.match(/metric-cell/g) ?? []).length === 1 ? '<td width="50%"></td>' : ''}</tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;width:100%;">${cells}</table>`;
}

function button(action: EmailAction): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 4px;"><tr><td bgcolor="${EMAIL_COLORS.accent}" style="border-radius:9px;background:${EMAIL_COLORS.accent};"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:14px 22px;font-family:${FONT_STACK};font-size:15px;line-height:1;font-weight:700;color:#FFFFFF;text-decoration:none;border:1px solid ${EMAIL_COLORS.accent};border-radius:9px;">${escapeHtml(action.label)}</a></td></tr></table>`;
}

export function renderEmailLayout(input: {
  preheader: string;
  title: string;
  bodyHtml: string;
  eyebrow?: string;
  action?: EmailAction;
  businessName?: string;
  customerFacing?: boolean;
  unsubscribeUrl?: string;
  footerNote?: string;
}): string {
  const logoUrl = getEmailAssetUrl('/flikker-wordmark.svg');
  const footerContext =
    input.customerFacing && input.businessName
      ? `Enviado por Flikker en nombre de ${escapeHtml(input.businessName)}.`
      : 'Flikker · Clientes, reputación y campañas en un solo lugar.';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(input.title)} · Flikker</title>
  <style type="text/css">
    table { border-collapse: separate; }
    a { color: ${EMAIL_COLORS.accentDark}; }
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-padding { padding-left: 22px !important; padding-right: 22px !important; }
      .metric-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${EMAIL_COLORS.background};font-family:${FONT_STACK};color:${EMAIL_COLORS.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(input.preheader)}&#847; &zwnj;&nbsp;&#847; &zwnj;&nbsp;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${EMAIL_COLORS.background};">
    <tr><td align="center" style="padding:34px 14px;">
      <table class="email-shell" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border:1px solid ${EMAIL_COLORS.border};border-radius:14px;overflow:hidden;">
        <tr><td height="5" bgcolor="${EMAIL_COLORS.accent}" style="height:5px;background:${EMAIL_COLORS.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td class="email-padding" style="padding:30px 38px 20px;background:#FFFFFF;">
          <a href="${escapeHtml(getEmailAppUrl())}" style="text-decoration:none;"><img src="${escapeHtml(logoUrl)}" width="118" alt="Flikker" border="0" style="display:block;width:118px;max-width:118px;height:auto;border:0;color:${EMAIL_COLORS.text};font-family:${FONT_STACK};font-size:20px;font-weight:800;" /></a>
        </td></tr>
        <tr><td class="email-padding" style="padding:10px 38px 38px;background:#FFFFFF;">
          ${input.eyebrow ? `<p style="margin:0 0 10px;font-family:${FONT_STACK};font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${EMAIL_COLORS.accentDark};">${escapeHtml(input.eyebrow)}</p>` : ''}
          <h1 style="margin:0 0 16px;font-family:${FONT_STACK};font-size:28px;line-height:1.18;font-weight:800;letter-spacing:-0.02em;color:${EMAIL_COLORS.text};">${escapeHtml(input.title)}</h1>
          ${input.bodyHtml}
          ${input.action ? button(input.action) : ''}
        </td></tr>
        <tr><td class="email-padding" style="padding:22px 38px;background:#F8F8FB;border-top:1px solid ${EMAIL_COLORS.border};font-family:${FONT_STACK};text-align:left;">
          <p style="margin:0;font-size:12px;line-height:1.55;color:${EMAIL_COLORS.muted};">${footerContext}</p>
          ${input.footerNote ? `<p style="margin:7px 0 0;font-size:12px;line-height:1.55;color:${EMAIL_COLORS.muted};">${input.footerNote}</p>` : ''}
          ${input.unsubscribeUrl ? `<p style="margin:7px 0 0;font-size:12px;line-height:1.55;"><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">No quiero recibir más estos emails</a></p>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
