import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard de código fuente — mismo criterio que el resto de las pantallas
 * públicas: `page.tsx` es un Server Component, así que se audita el texto en
 * vez de renderizarlo aislado.
 *
 * Caso crítico del pedido: un QR histórico `/qr/{businessId}` sobre un
 * negocio Check-in V2 nunca debe renderizar `QrLandingClient` (la pantalla
 * legacy) ni postear a `captureContact` — tiene que redirigir ANTES de
 * montar nada.
 */
const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("QR histórico — routing por experienceVersion", () => {
  it("redirige con el path que manda el backend, antes de renderizar la pantalla legacy", () => {
    expect(source).toMatch(/if \(isRedirect\(info\)\) redirect\(info\.redirectPath\)/);
  });

  it("el redirect se evalúa ANTES de renderizar QrLandingClient", () => {
    const redirectAt = source.indexOf("redirect(info.redirectPath)");
    const clientRenderAt = source.indexOf("<QrLandingClient");
    expect(redirectAt).toBeGreaterThan(-1);
    expect(clientRenderAt).toBeGreaterThan(-1);
    expect(redirectAt).toBeLessThan(clientRenderAt);
  });

  it("distingue la respuesta de redirect de la info normal por `redirectPath`, no por experienceVersion en el front", () => {
    // La decisión de V2/LEGACY la toma el backend (`isCheckinV2`) — el front
    // nunca la vuelve a tomar, solo reacciona a la forma de la respuesta.
    expect(source).toMatch(/"redirectPath" in info/);
    expect(source).not.toMatch(/experienceVersion/);
  });

  it("importa `redirect` de next/navigation", () => {
    expect(source).toMatch(/import\s*\{[^}]*redirect[^}]*\}\s*from\s*"next\/navigation"/);
  });
});
