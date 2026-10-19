import { buildProductEmailPreviewCatalog } from './email-preview-catalog';
import {
  PRODUCT_EMAIL,
  PRODUCT_EMAIL_FOOTER,
  renderProductEmailLayout,
} from './product-email-layout';

describe('shared product email layout', () => {
  it('shares the weekly report shell, PNG logo, palette and full-width CTA across the family', () => {
    for (const { html } of buildProductEmailPreviewCatalog()) {
      expect(html).toContain('class="email-shell"');
      expect(html).toContain(`max-width:${PRODUCT_EMAIL.width}px`);
      expect(html).toContain('flikker-email-logo.png');
      expect(html).toContain('alt="Flikker"');
      expect(html).toContain(`background:${PRODUCT_EMAIL.background}`);
      expect(html).toContain(`bgcolor="${PRODUCT_EMAIL.accent}"`);
      expect(html).toContain(`font-family:${PRODUCT_EMAIL.font}`);
      expect(html).toContain(PRODUCT_EMAIL_FOOTER);
      expect(html).toContain('<!--[if mso]>');
      expect(html).toContain('mso-padding-alt:17px 24px');
      expect(html).toContain('@media only screen and (max-width: 620px)');
      expect(html).not.toMatch(
        /<svg|<script|display:(flex|grid)|linear-gradient|fonts.googleapis/,
      );
      expect(
        html.match(
          />Confirmar mi cuenta<|>Ir a Flikker<|>Ver todas mis estadísticas</g,
        ),
      ).toHaveLength(1);
    }
  });

  it('escapes raw layout inputs and preserves valid action query strings', () => {
    const html = renderProductEmailLayout({
      preheader: '<preview>',
      title: 'Ana & <Lucía>',
      eyebrow: '<seguridad>',
      bodyHtml: '<p>Safe body</p>',
      action: { label: '<Abrir>', url: 'https://example.com/?token=a%2Bb&x=2' },
    });
    expect(html).toContain('Ana &amp; &lt;Lucía&gt;');
    expect(html).toContain('&lt;preview&gt;');
    expect(html).toContain('&lt;seguridad&gt;');
    expect(html).toContain('&lt;Abrir&gt;');
    expect(html).toContain('token=a%2Bb&amp;x=2');
  });

  it('rejects unsupported logo and CTA protocols', () => {
    const input = {
      preheader: 'Preview',
      title: 'Title',
      bodyHtml: '',
      action: { label: 'Open', url: 'https://example.com' },
    };
    expect(() =>
      renderProductEmailLayout({ ...input, logoUrl: 'javascript:alert(1)' }),
    ).toThrow();
    expect(() =>
      renderProductEmailLayout({
        ...input,
        action: { label: 'Open', url: 'javascript:alert(1)' },
      }),
    ).toThrow();
  });
});
