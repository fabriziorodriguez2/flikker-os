import {
  buildEmailPreviewCatalog,
  buildProductEmailPreviewCatalog,
} from './email-preview-catalog';

describe('email preview catalog', () => {
  it('incluye todas las comunicaciones activas y variantes de estado', () => {
    const previews = buildEmailPreviewCatalog();
    expect(previews).toHaveLength(18);
    expect(new Set(previews.map((preview) => preview.slug)).size).toBe(18);
    expect(
      previews.every((preview) => preview.html.includes('<!DOCTYPE html')),
    ).toBe(true);
    expect(
      previews.every((preview) =>
        /flikker-(wordmark\.svg|email-logo\.png)/.test(preview.html),
      ),
    ).toBe(true);
    expect(
      previews.every(
        (preview) =>
          !preview.html.includes('linear-gradient') &&
          !preview.html.includes('fonts.googleapis.com'),
      ),
    ).toBe(true);
  });

  it('provides all four product family scenarios and plain text for auth/welcome', () => {
    const previews = buildProductEmailPreviewCatalog();
    expect(previews).toHaveLength(4);
    expect(previews.slice(0, 3).every((preview) => preview.text)).toBe(true);
    expect(previews[1].html).toContain('Hasta 50 clientes');
    expect(previews[2].html).not.toContain('Plan Base');
    expect(previews[3].html).toContain('Tu semana en Flikker');
  });
});
