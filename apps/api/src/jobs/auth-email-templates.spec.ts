import {
  buildPasswordResetEmail,
  buildVerificationEmail,
} from './auth-email-templates';

describe('auth email templates', () => {
  it('la verificación conserva vencimiento, CTA y seguridad', () => {
    const html = buildVerificationEmail({
      firstName: 'Ana <script>',
      verifyUrl: 'https://app.flikker.com/verify-email?token=abc',
      expiresInHours: 48,
    });
    expect(html).toContain('Confirmar mi cuenta');
    expect(html).toContain('48 horas');
    expect(html).toContain('podés ignorar este email');
    expect(html).not.toContain('<script>');
  });

  it('la recuperación conserva vencimiento, CTA y aviso de seguridad', () => {
    const html = buildPasswordResetEmail({
      firstName: null,
      resetUrl: 'https://app.flikker.com/reset-password?token=abc',
      expiresInMinutes: 30,
    });
    expect(html).toContain('Crear nueva contraseña');
    expect(html).toContain('30 minutos');
    expect(html).toContain('contraseña actual seguirá funcionando');
  });
});
