import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guarda de cableado, mismo criterio que `layout-nav-wiring.test.ts`: este
 * repo no tiene infraestructura de rendering (React Testing Library) para
 * montar `(panel)/layout.tsx` (Server Component async) con una sesión
 * simulada, así que esto prueba el cableado real leyendo el código fuente.
 *
 * Bug real que esto fija: `needsOnboarding` mandaba a CUALQUIER OWNER de un
 * negocio LEGACY a `/comenzar` en cada navegación del panel —
 * `onboardingCompletedAt` queda en null para siempre en un negocio que nunca
 * pasó por el onboarding self-service, y sin chequear `experienceVersion`
 * eso se leía como "borrador de CHECKIN_V2 en curso". La causa raíz real
 * está en `OnboardingService#findDraft` (ver `customers-legacy-access.e2e-
 * spec.ts`); esto es la segunda barrera, en el punto exacto donde vivía el
 * redirect que el dueño LEGACY veía.
 */
describe("(panel)/layout.tsx — el guard de onboarding nunca atrapa a un negocio LEGACY", () => {
  const source = readFileSync(join(__dirname, "layout.tsx"), "utf-8");

  it("needsOnboarding exige experienceVersion === CHECKIN_V2", () => {
    const start = source.indexOf("const needsOnboarding");
    const end = source.indexOf(";", source.indexOf("redirect(\"/comenzar\")"));
    const block = source.slice(start, end);

    expect(block).toMatch(/experienceVersion === ["']CHECKIN_V2["']/);
  });
});
