/**
 * Templates de email de "Notificaciones" — funciones planas que devuelven
 * `{subject, html}`, sin motor de templating nuevo (consistente con
 * `EmailService.send`, que ya recibe HTML armado). HTML mínimo, sin
 * dependencias externas ni imágenes remotas, para que se vea razonable en
 * cualquier cliente de correo sin necesitar un servicio de assets.
 */

function wrapper(businessName: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#F5F6FA;font-family:Arial,Helvetica,sans-serif;color:#1A202C;">
    <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8891A4;">${escapeHtml(businessName)}</p>
      ${bodyHtml}
      <p style="margin:32px 0 0;font-size:12px;color:#B0B8C9;">Enviado por Flikker en nombre de ${escapeHtml(businessName)}.</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Free — el premio de la tarjeta de sellos está por vencer sin canjear. */
export function stampsExpiryEmail(input: {
  businessName: string;
  customerName: string;
  rewardName: string;
  daysRemaining: number;
  redemptionCode: string;
}) {
  const dayWord = input.daysRemaining === 1 ? 'día' : 'días';
  return {
    subject: `Tu premio en ${input.businessName} vence en ${input.daysRemaining} ${dayWord}`,
    html: wrapper(
      input.businessName,
      `<h1 style="margin:0 0 16px;font-size:20px;">¡Hola ${escapeHtml(input.customerName)}!</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Completaste tu tarjeta de sellos y ganaste <strong>${escapeHtml(input.rewardName)}</strong> — todavía no lo canjeaste, y vence en <strong>${input.daysRemaining} ${dayWord}</strong>.</p>
      <p style="margin:0 0 24px;font-size:13px;color:#5F6780;">Mostrá este código en el mostrador para canjearlo:</p>
      <p style="margin:0;padding:16px;background:#EEF0FB;border-radius:12px;text-align:center;font-size:22px;font-weight:700;letter-spacing:0.1em;color:#4A56A6;">${escapeHtml(input.redemptionCode)}</p>`,
    ),
  };
}

/**
 * Free — mismo aviso que `stampsExpiryEmail`, en texto plano para WhatsApp.
 * WhatsApp no tiene HTML/asunto — por eso vive acá como texto, no como una
 * versión recortada de la plantilla de email.
 */
export function stampsExpiryWhatsAppText(input: {
  customerName: string;
  rewardName: string;
  daysRemaining: number;
  redemptionCode: string;
}): string {
  const dayWord = input.daysRemaining === 1 ? 'día' : 'días';
  return `¡Hola ${input.customerName}! Ganaste ${input.rewardName} con tu tarjeta y todavía no lo canjeaste — vence en ${input.daysRemaining} ${dayWord}.\n\nMostrá este código para canjearlo: ${input.redemptionCode}`;
}

/**
 * Free — la tarjeta de sellos se acaba de completar (ACTIVE → UNLOCKED).
 * Apunta a la emisión real del Benefit desbloqueado (`/beneficio/{id}`,
 * mismo link bearer que usa Notificaciones → Promociones), nunca a un link
 * genérico del negocio — el cliente tiene que llegar directo a SU QR.
 */
export function rewardGoalUnlockedWhatsAppText(input: {
  customerName: string;
  rewardName: string;
  benefitLink: string;
}): string {
  return `🎉 ¡Completaste tu tarjeta, ${input.customerName}! Ya tenés disponible ${input.rewardName}.\n\nCuando vengas, mostrale tu QR al personal para canjearlo: ${input.benefitLink}`;
}

/** Pro — mismo saludo que `birthdayEmail`, en texto plano para WhatsApp. */
export function birthdayWhatsAppText(input: {
  businessName: string;
  customerName: string;
}): string {
  return `¡Feliz cumpleaños, ${input.customerName}! 🎉 Todo el equipo de ${input.businessName} te desea un muy feliz día.`;
}

/**
 * Pro — "casi llegás" (REWARD_GOAL_PROGRESS) o "te extrañamos"
 * (AT_RISK/INACTIVE_RECOVERY) por email. Deliberadamente NO reconstruye el
 * mensaje desde cero: reusa el mismo `body` que Retention V2 ya compuso
 * para el WhatsApp de esta misma automatización (`RetentionV2SendService.
 * createMessage`) — la DECISIÓN de qué decir sigue siendo una sola, el
 * email es solo otro canal para el mismo mensaje ya aprobado.
 */
export function retentionMessageEmail(input: {
  businessName: string;
  customerName: string;
  messageBody: string;
  isProgressReminder: boolean;
}) {
  return {
    subject: input.isProgressReminder
      ? '¡Ya casi completás tu tarjeta!'
      : `Te extrañamos en ${input.businessName}`,
    html: wrapper(
      input.businessName,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hola ${escapeHtml(input.customerName)},</p>
      <p style="margin:0;font-size:15px;line-height:1.6;white-space:pre-line;">${escapeHtml(input.messageBody)}</p>`,
    ),
  };
}

/** Pro — cumpleaños del cliente. */
export function birthdayEmail(input: {
  businessName: string;
  customerName: string;
}) {
  return {
    subject: `¡Feliz cumpleaños de parte de ${input.businessName}!`,
    html: wrapper(
      input.businessName,
      `<h1 style="margin:0 0 16px;font-size:20px;">¡Feliz cumpleaños, ${escapeHtml(input.customerName)}! 🎉</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;">Todo el equipo de ${escapeHtml(input.businessName)} te desea un muy feliz día.</p>`,
    ),
  };
}

/** Pro — promoción manual del dueño (mismo mensaje que WhatsApp, formato email). */
export function promotionEmail(input: {
  businessName: string;
  customerName: string;
  messageBody: string;
  benefitTitle: string | null;
  checkinLink: string | null;
}) {
  return {
    subject: input.businessName,
    html: wrapper(
      input.businessName,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hola ${escapeHtml(input.customerName)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;white-space:pre-line;">${escapeHtml(input.messageBody)}</p>
      ${
        input.benefitTitle
          ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">🎁 <strong>${escapeHtml(input.benefitTitle)}</strong></p>`
          : ''
      }
      ${
        input.checkinLink
          ? `<p style="margin:0;"><a href="${escapeHtml(input.checkinLink)}" style="color:#5C6BC0;font-weight:600;">Ver mi beneficio</a></p>`
          : ''
      }`,
    ),
  };
}
