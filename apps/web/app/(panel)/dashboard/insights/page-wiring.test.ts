import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guarda de cableado, mismo criterio que `(panel)/layout-onboarding-guard.test.ts`:
 * este repo no tiene infraestructura de rendering para montar un Server
 * Component async con una sesión simulada, así que esto prueba el cableado
 * real leyendo el código fuente.
 *
 * Bug real que esto fija: `InsightsPage` decidía qué experiencia mostrar con
 * `isCheckinV2Business`, que devuelve `false` bajo impersonation — un
 * Platform Admin impersonando un negocio Check-in V2 real veía el Insights
 * LEGACY en vez del que ve el dueño. El comportamiento correcto vive en
 * `absorbed-route.test.ts` (la distinción de impersonation entre las dos
 * funciones); esto solo confirma que la pantalla llama a la función correcta.
 */
describe("(dashboard)/insights/page.tsx — usa isCheckinV2Experience, no isCheckinV2Business", () => {
  const source = readFileSync(join(__dirname, "page.tsx"), "utf-8");

  it("importa isCheckinV2Experience de absorbed-route", () => {
    expect(source).toMatch(
      /import\s*\{[^}]*isCheckinV2Experience[^}]*\}\s*from\s*["']@\/components\/panel\/absorbed-route["']/,
    );
  });

  it("la decisión de qué pantalla renderizar usa isCheckinV2Experience", () => {
    const decisionLine = source
      .split("\n")
      .find((line) => /if\s*\(await\s+isCheckinV2/.test(line));
    expect(decisionLine).toBeDefined();
    expect(decisionLine).toContain("isCheckinV2Experience");
  });

  it("NO usa isCheckinV2Business para esa decisión (regresión: no debe volver a caer bajo impersonation)", () => {
    const decisionLine = source
      .split("\n")
      .find((line) => /if\s*\(await\s+isCheckinV2/.test(line));
    expect(decisionLine).not.toContain("isCheckinV2Business");
  });
});
