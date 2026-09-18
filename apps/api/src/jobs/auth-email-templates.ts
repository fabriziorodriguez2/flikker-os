import {
  emailCallout,
  emailParagraph,
  escapeHtml,
  renderEmailLayout,
} from './email-design-system';

export function buildVerificationEmail(input: {
  firstName?: string | null;
  verifyUrl: string;
  expiresInHours: number;
}) {
  const name = input.firstName?.trim() || 'hola';
  return renderEmailLayout({
    preheader: `Confirmá tu cuenta de Flikker. El enlace vence en ${input.expiresInHours} horas.`,
    eyebrow: 'Seguridad de tu cuenta',
    title: 'Confirmá tu cuenta',
    bodyHtml:
      emailParagraph(
        `Hola ${escapeHtml(name)}, te enviamos este enlace para confirmar tu cuenta de Flikker.`,
      ) +
      emailCallout({
        label: 'Importante',
        tone: 'neutral',
        contentHtml: `El enlace vence en <strong>${input.expiresInHours} horas</strong>. Si no creaste esta cuenta, podés ignorar este email.`,
      }),
    action: { label: 'Confirmar mi cuenta', url: input.verifyUrl },
    footerNote:
      'Por seguridad, no compartas este correo ni el enlace de confirmación.',
  });
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
