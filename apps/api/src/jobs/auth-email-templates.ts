import {
  emailCallout,
  emailParagraph,
  escapeHtml,
  renderEmailLayout,
} from './email-design-system';
import {
  productEmailCard,
  productEmailLabel,
  productEmailParagraph,
  PRODUCT_EMAIL_FOOTER,
  renderProductEmailLayout,
} from './product-email-layout';

interface VerificationEmailInput {
  firstName?: string | null;
  verifyUrl: string;
  expiresInHours: number;
}

function verificationCopy(input: VerificationEmailInput) {
  const name = input.firstName?.trim();
  return {
    greeting: name ? `Hola ${name},` : 'Hola,',
    intro:
      'Creaste una cuenta en Flikker. Confirmá tu email para continuar y empezar a configurar tu negocio.',
    expiry: `El enlace vence en ${input.expiresInHours} horas.`,
    security: 'Si no creaste esta cuenta, podés ignorar este email.',
  };
}

export function buildVerificationEmail(input: VerificationEmailInput) {
  const copy = verificationCopy(input);
  return renderProductEmailLayout({
    preheader: `Confirmá tu cuenta de Flikker. El enlace vence en ${input.expiresInHours} horas.`,
    eyebrow: 'Seguridad de tu cuenta',
    title: 'Confirmá tu cuenta',
    bodyHtml:
      productEmailParagraph(escapeHtml(copy.greeting)) +
      productEmailParagraph(escapeHtml(copy.intro)),
    action: { label: 'Confirmar mi cuenta', url: input.verifyUrl },
    afterActionHtml: productEmailCard(
      productEmailLabel('Importante') +
        productEmailParagraph(`<strong>${escapeHtml(copy.expiry)}</strong>`) +
        productEmailParagraph(escapeHtml(copy.security)),
    ),
  });
}

export function buildVerificationEmailText(input: VerificationEmailInput) {
  const copy = verificationCopy(input);
  return [
    'Confirmá tu cuenta',
    copy.greeting,
    copy.intro,
    `Confirmar mi cuenta: ${input.verifyUrl}`,
    copy.expiry,
    copy.security,
    PRODUCT_EMAIL_FOOTER,
  ].join('\n\n');
}

export function buildPasswordResetEmail(input: {
  firstName?: string | null;
  resetUrl: string;
  expiresInMinutes: number;
}) {
  const name = input.firstName?.trim() || 'hola';
  return renderEmailLayout({
    preheader: `Creá una nueva contraseña. El enlace vence en ${input.expiresInMinutes} minutos.`,
    eyebrow: 'Seguridad de tu cuenta',
    title: 'Recuperá tu contraseña',
    bodyHtml:
      emailParagraph(
        `Hola ${escapeHtml(name)}, recibimos un pedido para crear una nueva contraseña en Flikker.`,
      ) +
      emailCallout({
        label: 'Importante',
        tone: 'warning',
        contentHtml: `El enlace vence en <strong>${input.expiresInMinutes} minutos</strong>. Si no pediste este cambio, podés ignorar este email: tu contraseña actual seguirá funcionando.`,
      }),
    action: { label: 'Crear nueva contraseña', url: input.resetUrl },
    footerNote:
      'Por seguridad, no compartas este correo ni el enlace de recuperación.',
  });
}
