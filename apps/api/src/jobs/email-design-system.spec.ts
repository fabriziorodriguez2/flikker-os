import {
  emailCallout,
  emailStats,
  escapeHtml,
  renderEmailLayout,
} from './email-design-system';

describe('email design system', () => {
  it('renderiza una estructura robusta, responsive y con el wordmark oficial', () => {
    const html = renderEmailLayout({
      preheader: 'Vista previa del mensaje',
      eyebrow: 'Café Central',
      title: 'Título de prueba',
      bodyHtml:
        emailStats([{ label: 'Clientes', value: 42 }]) +
        emailCallout({ contentHtml: 'Contenido', tone: 'success' }),
      action: {
        label: 'Abrir panel',
        url: 'https://app.flikker.com/dashboard',
      },
    });

    expect(html).toContain('flikker-wordmark.svg');
    expect(html).toContain('Vista previa del mensaje');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('@media only screen and (max-width: 620px)');
    expect(html).toContain('width="600"');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('linear-gradient');
  });

  it('escapa contenido y enlaces dinámicos', () => {
    expect(escapeHtml('<script>"x" & y</script>')).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;',
    );
    const html = renderEmailLayout({
      preheader: '<preview>',
      title: '<title>',
      bodyHtml: 'seguro',
      action: { label: '<click>', url: 'https://test/?a=1&b=2' },
    });
    expect(html).toContain('&lt;title&gt;');
    expect(html).toContain('https://test/?a=1&amp;b=2');
  });
});
