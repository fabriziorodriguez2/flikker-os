import {
  renderWelcomeFreeEmail,
  renderWelcomeProEmail,
} from './registration-subscription-email-templates';

describe('account welcome emails', () => {
  const appUrl = 'https://panel.example.com/dashboard?source=email&welcome=1';
  const freePlan = {
    slug: 'free',
    name: 'Free — sellos y beneficios',
    maxCustomers: 73,
  };

  it('uses the real name, customer limit and app link in HTML and plain text', () => {
    const { html, text } = renderWelcomeFreeEmail({
      firstName: 'Ana & <Lucía>',
      plan: freePlan,
      appUrl,
    });
    expect(html).toContain('Hola Ana &amp; &lt;Lucía&gt;,');
    expect(html).not.toContain('&amp;lt;');
    expect(text).toContain('Hola Ana & <Lucía>,');
    for (const content of [html, text]) {
      expect(content).toContain('Plan Base');
      expect(content).toContain('Hasta 73 clientes');
      expect(content).not.toContain('50 clientes');
      expect(content).toContain('Sin tarjeta');
      expect(content).toContain('Sin vencimiento');
      expect(content).toContain('Configuración → Suscripción');
      expect(content).toContain('Ir a Flikker');
      expect(content).toContain('Personalizá tu tarjeta');
      expect(content).toContain('Configurá tu primer beneficio');
      expect(content).toContain('Probá tu QR');
    }
    expect(html).toContain(
      'href="https://panel.example.com/dashboard?source=email&amp;welcome=1"',
    );
    expect(text).toContain(appUrl);
    expect(text).not.toContain('<table');
  });

  it('does not fabricate a plan or limit when subscription context is missing', () => {
    const { html, text } = renderWelcomeFreeEmail({ firstName: 'Ana' });
    for (const content of [html, text]) {
      expect(content).not.toContain('Plan Base');
      expect(content).not.toContain('50 clientes');
      expect(content).not.toContain('Sin tope de clientes');
    }
  });

  it.each(['pro', 'pro-selfservice'])(
    'does not show Free claims if the supplied subscription is %s',
    (slug) => {
      const result = renderWelcomeFreeEmail({
        firstName: 'Ana',
        plan: { slug, name: 'Pro', maxCustomers: null },
      });
      for (const content of [result.html, result.text]) {
        expect(content).toContain('listo en Flikker Pro');
        expect(content).toContain('Sin tope de clientes');
        expect(content).not.toContain('Plan Base');
        expect(content).not.toContain('Sin tarjeta');
        expect(content).not.toContain('Sin vencimiento');
        expect(content).not.toContain('pasar a Pro');
      }
    },
  );

  it('keeps the Pro confirmation subject and optional guide, without Free copy', () => {
    const result = renderWelcomeProEmail({
      firstName: 'José',
      businessName: 'Café & Pan',
      gettingStartedPdfUrl: 'https://example.com/guia.pdf?a=1&b=2',
      appUrl,
    });
    expect(result.subject).toBe('Tu suscripción Pro está activa');
    expect(result.html).toContain('Café &amp; Pan');
    expect(result.html).toContain('guia.pdf?a=1&amp;b=2');
    expect(result.text).toContain('guia.pdf?a=1&b=2');
    for (const content of [result.html, result.text]) {
      expect(content).toContain('Hola José,');
      expect(content).toContain('Flikker Pro');
      expect(content).toContain('Beneficios sin límite de prueba');
      expect(content).not.toContain('Plan Base');
      expect(content).not.toContain('50 clientes');
      expect(content).not.toContain('Sin tarjeta');
      expect(content).not.toContain('Sin vencimiento');
    }
  });

  it('handles an unlimited Free plan and a missing optional guide', () => {
    const { html, text } = renderWelcomeFreeEmail({
      firstName: 'Ana',
      plan: { ...freePlan, maxCustomers: null },
    });
    expect(html).toContain('Sin tope de clientes');
    expect(text).toContain('Sin tope de clientes');
    expect(html).not.toContain('null clientes');
    expect(html).not.toContain('guía de primeros pasos');
  });
});
