import {
  buildPasswordResetEmail,
  buildVerificationEmail,
  buildVerificationEmailText,
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
    expect(html).toContain('Hola Ana &lt;script&gt;,');
    expect(html).toContain(
      'href="https://app.flikker.com/verify-email?token=abc"',
    );
    expect(html).toContain('podés ignorar este email');
    expect(html).not.toContain('<script>');
  });

  it('keeps the original verification URL, name and expiry in plain text', () => {
    const input = {
      firstName: 'Lucía & Ana',
      verifyUrl:
        'https://app.example.com/verify-email?token=a%2Bb&email=ana%40example.com',
      expiresInHours: 48,
    };
    const html = buildVerificationEmail(input);
    const text = buildVerificationEmailText(input);
    expect(text).toContain('Hola Lucía & Ana,');
    expect(text).toContain(input.verifyUrl);
    expect(text).toContain('48 horas');
    expect(text).toContain('podés ignorar este email');
    expect(text).not.toContain('<table');
    expect(text).not.toContain('&amp;');
    expect(html.indexOf('>Confirmar mi cuenta<')).toBeLessThan(
      html.indexOf('>Importante<'),
    );
    expect(html).toContain('token=a%2Bb&amp;email=ana%40example.com');
  });

  it('handles absent names and does not hardcode the supplied expiry', () => {
    const input = {
      firstName: ' ',
      verifyUrl: 'https://example.com/verify?token=preview',
      expiresInHours: 24,
    };
    expect(buildVerificationEmail(input)).toContain('Hola,');
    expect(buildVerificationEmailText(input)).toContain('24 horas');
    expect(buildVerificationEmail(input)).not.toContain('48 horas');
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
