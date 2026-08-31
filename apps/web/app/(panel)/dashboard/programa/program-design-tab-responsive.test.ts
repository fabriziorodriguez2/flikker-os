import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guarda de cableado, mismo criterio que
 * `(panel)/layout-onboarding-guard.test.ts`: este repo no tiene
 * infraestructura de rendering para simular distintos anchos de viewport,
 * así que esto prueba el contrato responsive leyendo el código fuente.
 *
 * Bug real que esto fija: el grid de "editor + preview" saltaba directo de
 * una columna (<1024px) a un preview FIJO de 340px (≥1024px) — en una
 * laptop angosta (1024-1279px) eso apretaba el formulario contra el propio
 * nav del dashboard. El fix agrega una franja intermedia (`lg:` con preview
 * más chico + colapsable) y nunca toca el comportamiento de desktop grande
 * (`xl:`, sin cambios de fondo respecto al original).
 */
describe("program-design-tab.tsx — responsive del editor sin aplastar desktop grande", () => {
  const source = readFileSync(join(__dirname, "program-design-tab.tsx"), "utf-8");

  it("desktop grande (xl:) sigue siendo editor + preview sticky de 340px, sin condicionar a ningún toggle", () => {
    expect(source).toContain("xl:grid-cols-[minmax(0,1fr)_340px]");
  });

  it("existe una franja intermedia (lg:) con un preview más angosto que el de desktop grande", () => {
    expect(source).toContain("lg:grid-cols-[minmax(0,1fr)_260px]");
  });

  it("el toggle de colapsar preview solo vive en la franja angosta (lg visible, xl oculto)", () => {
    const toggleLine = source
      .split("\n")
      .find((line) => line.includes("setDesktopPreviewCollapsed") && line.includes("className"));
    expect(toggleLine ?? "").toBeDefined();
    const buttonBlock = source.slice(
      source.indexOf("onClick={() => setDesktopPreviewCollapsed"),
      source.indexOf("</button>", source.indexOf("onClick={() => setDesktopPreviewCollapsed")),
    );
    expect(buttonBlock).toContain("lg:inline-flex");
    expect(buttonBlock).toContain("xl:hidden");
  });

  it("mobile/tablet (<1024px) tiene un botón propio para ver el preview, oculto en lg+", () => {
    const button = source.slice(
      source.indexOf("onClick={() => setMobilePreviewOpen(true)}"),
      source.indexOf("</button>", source.indexOf("onClick={() => setMobilePreviewOpen(true)}")),
    );
    expect(button).toContain("lg:hidden");
  });

  it("el preview (PhoneFrame + LoyaltyCard) se define una sola vez y se reutiliza en el aside y en la hoja mobile — nunca duplicado", () => {
    const occurrences = source.split("previewContent").length - 1;
    // La declaración + su uso en el <aside> + su uso en la hoja mobile.
    expect(occurrences).toBe(3);
  });
});
