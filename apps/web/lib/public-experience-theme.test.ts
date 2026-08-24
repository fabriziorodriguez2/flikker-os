import { contrastRatio } from "./loyalty-card-theme";
import {
  buildPublicExperienceTheme,
  FLIKKER_FALLBACK_BRAND,
} from "./public-experience-theme";

/**
 * La promesa del selector de color de Programa → Página de inscripción: el
 * dueño elige su fondo, pero NO puede volver ilegible su propia pantalla.
 * Estos tests son esa promesa escrita.
 */

// Casos reales y extremos: el del negocio de la captura, blanco puro (el peor
// caso para el texto blanco que estaba hardcodeado), negro puro, y un violeta
// saturado.
const BACKGROUNDS = ["#ADAB99", "#FFFFFF", "#000000", "#5C6BC0", "#FFF9C4"];

describe("tema de la experiencia pública", () => {
  it.each(BACKGROUNDS)(
    "el texto principal cumple 4.5:1 sobre %s",
    (background) => {
      const theme = buildPublicExperienceTheme(background, "#5C6BC0");
      expect(contrastRatio(theme.text, background)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(BACKGROUNDS)("el acento cumple 3:1 sobre %s", (background) => {
    const theme = buildPublicExperienceTheme(background, "#5C6BC0");
    expect(contrastRatio(theme.accent, background)).toBeGreaterThanOrEqual(3);
  });

  it.each(BACKGROUNDS)(
    "el contenido del botón contrasta contra su relleno (%s)",
    (background) => {
      const theme = buildPublicExperienceTheme(background, "#5C6BC0");
      expect(contrastRatio(theme.onAccent, theme.accent)).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );

  it("un fondo claro deja de usar texto blanco", () => {
    // Este es literalmente el bug: `text-white` fijo sobre un fondo claro.
    expect(buildPublicExperienceTheme("#FFFFFF", "#5C6BC0").text).not.toBe(
      "#FFFFFF",
    );
  });

  it("un fondo oscuro sí usa texto claro", () => {
    expect(buildPublicExperienceTheme("#101010", "#5C6BC0").text).toBe(
      "#FFFFFF",
    );
  });

  it("sin color propio conserva el degradado de marca de siempre", () => {
    const theme = buildPublicExperienceTheme(null, "#5C6BC0");
    expect(theme.background.backgroundImage).toContain("linear-gradient");
    expect(theme.background.backgroundColor).toBeUndefined();
  });

  it("con color propio el fondo es plano — nada de degradado encima", () => {
    const theme = buildPublicExperienceTheme("#ADAB99", "#5C6BC0");
    expect(theme.background.backgroundColor).toBe("#ADAB99");
    expect(theme.background.backgroundImage).toBe("none");
  });

  it("un valor de color inválido no rompe la pantalla — cae a la marca", () => {
    const theme = buildPublicExperienceTheme("no-es-un-color", null);
    expect(theme.base).toBe(FLIKKER_FALLBACK_BRAND);
    expect(contrastRatio(theme.text, theme.base)).toBeGreaterThanOrEqual(4.5);
  });

  it("acepta hex corto (#ABC), no lo descarta", () => {
    expect(buildPublicExperienceTheme("#FFF", "#5C6BC0").base).toBe("#FFFFFF");
  });
});
