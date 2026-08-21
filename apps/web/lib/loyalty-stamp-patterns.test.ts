import {
  STAMP_BACKGROUND_PATTERNS,
  buildStampPatternDataUri,
  effectivePatternOpacity,
  isStampPatternKey,
  tileSizeFor,
  type StampPatternKey,
} from "./loyalty-stamp-patterns";

describe("isStampPatternKey", () => {
  it("acepta las 8 keys reales", () => {
    for (const option of STAMP_BACKGROUND_PATTERNS) {
      expect(isStampPatternKey(option.key)).toBe(true);
    }
  });

  it("rechaza basura", () => {
    expect(isStampPatternKey("glitter")).toBe(false);
    expect(isStampPatternKey(null)).toBe(false);
    expect(isStampPatternKey(undefined)).toBe(false);
  });
});

describe("effectivePatternOpacity — nunca dificulta la lectura", () => {
  it("en el máximo (100), nunca pasa el techo seguro", () => {
    expect(effectivePatternOpacity(100)).toBeLessThanOrEqual(0.34);
  });

  it("en el mínimo (0), sigue siendo un valor válido y bajo", () => {
    expect(effectivePatternOpacity(0)).toBeCloseTo(0.04);
  });

  it("valores fuera de rango se recortan a 0-100", () => {
    expect(effectivePatternOpacity(500)).toBe(effectivePatternOpacity(100));
    expect(effectivePatternOpacity(-20)).toBe(effectivePatternOpacity(0));
  });

  it("es monótono creciente", () => {
    expect(effectivePatternOpacity(10)).toBeLessThan(
      effectivePatternOpacity(90),
    );
  });
});

describe("buildStampPatternDataUri", () => {
  it('"none" nunca genera una imagen de fondo', () => {
    expect(buildStampPatternDataUri("none", "#5C6BC0", 0.2)).toBeNull();
  });

  it("cada patrón real (salvo none) genera un data URI de SVG válido", () => {
    const patterns = STAMP_BACKGROUND_PATTERNS.map((o) => o.key).filter(
      (key): key is Exclude<StampPatternKey, "none"> => key !== "none",
    );
    for (const key of patterns) {
      const uri = buildStampPatternDataUri(key, "#5C6BC0", 0.2);
      expect(uri).toMatch(/^data:image\/svg\+xml,/);
      expect(tileSizeFor(key)).toBeGreaterThan(0);
    }
  });

  it("el color y la opacidad pedidos aparecen en el SVG generado", () => {
    const uri = buildStampPatternDataUri("bubbles", "#FF00AA", 0.25)!;
    const decoded = decodeURIComponent(uri.replace("data:image/svg+xml,", ""));
    expect(decoded).toContain("#FF00AA");
    expect(decoded).toContain("0.25");
  });
});
