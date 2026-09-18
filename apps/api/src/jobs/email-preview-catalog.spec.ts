import { buildEmailPreviewCatalog } from './email-preview-catalog';

describe('email preview catalog', () => {
  it('incluye todas las comunicaciones activas y variantes de estado', () => {
    const previews = buildEmailPreviewCatalog();
    expect(previews).toHaveLength(15);
    expect(new Set(previews.map((preview) => preview.slug)).size).toBe(15);
    expect(
      previews.every((preview) => preview.html.includes('<!DOCTYPE html')),
    ).toBe(true);
    expect(
      previews.every((preview) =>
        preview.html.includes('flikker-wordmark.svg'),
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
});
