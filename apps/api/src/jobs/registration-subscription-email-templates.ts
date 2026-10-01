import {
  emailCallout,
  emailParagraph,
  escapeHtml,
  getEmailAppUrl,
  renderEmailLayout,
} from './email-design-system';

/**
 * Parte 5 — register-first, pago después: los dos emails transaccionales
 * nuevos de esta tanda. Mismo sistema de diseño que el resto de los emails
 * (`renderEmailLayout`), nunca otro mailer — ver §15 del pedido.
 *
 * `customerFacing: false`/`businessName: undefined` a propósito: son
 * emails del PRODUCTO Flikker hacia su propio usuario, no "en nombre de"
 * ningún Business — el footer de `renderEmailLayout` ya distingue esto.
 */

export function renderWelcomeFreeEmail(input: { firstName: string }) {
  return {
    subject: 'Bienvenido a Flikker',
    html: renderEmailLayout({
      preheader: 'Tu cuenta y tu negocio ya están listos en el plan Base.',
      title: `Hola ${escapeHtml(input.firstName)}, bienvenido a Flikker`,
      bodyHtml:
        emailParagraph(
          'Tu cuenta y tu negocio ya están listos, en el plan Base — hasta 50 clientes, sin tarjeta, sin vencimiento.',
        ) +
        emailParagraph(
          'Cuando quieras, podés pasar a Pro desde Configuración → Suscripción.',
          { muted: true, small: true },
        ),
      action: { label: 'Ir a Flikker', url: getEmailAppUrl() },
    }),
  };
}

export function renderWelcomeProEmail(input: {
  firstName: string;
  businessName: string;
  gettingStartedPdfUrl?: string;
}) {
  const pdfCallout = input.gettingStartedPdfUrl
    ? emailCallout({
        label: 'Primeros pasos',
        tone: 'success',
        contentHtml: `Preparamos una guía corta para sacarle el máximo provecho a Flikker Pro: <a href="${escapeHtml(input.gettingStartedPdfUrl)}" style="color:inherit;text-decoration:underline;">ver guía</a>.`,
      })
    : '';

  return {
    subject: 'Tu suscripción Pro está activa',
    html: renderEmailLayout({
      preheader: `${input.businessName} ya tiene Flikker Pro activo.`,
      title: `${escapeHtml(input.firstName)}, tu suscripción Pro está activa`,
      bodyHtml:
        emailParagraph(
          `Mercado Pago confirmó tu pago — <strong>${escapeHtml(input.businessName)}</strong> ya tiene Flikker Pro: sin tope de clientes y Beneficios sin límite de prueba.`,
        ) + pdfCallout,
      action: { label: 'Ir a Flikker', url: getEmailAppUrl() },
    }),
  };
}
