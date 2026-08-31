import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guarda de cableado, mismo criterio que
 * `(panel)/layout-onboarding-guard.test.ts`: este repo no tiene
 * infraestructura de rendering (ni RTL) para montar un client component con
 * `fetch`/estado/contexto simulados, así que esto prueba el cableado real
 * leyendo el código fuente.
 *
 * Bug real que esto fija: el drawer de detalle de cliente mostraba "3 de 6
 * sellos" en texto pero la grilla de `RewardGoalStamps` se veía casi vacía
 * — porque nunca se le pasaban los colores/ícono reales de la tarjeta
 * (`cardColor`/`stampAreaColor`/`stampColor`/`icon`), así que caía al tema
 * por defecto (casi blanco sobre blanco). El fix reutiliza el mismo
 * endpoint que ya usa Programa para su propia preview
 * (`/businesses/current/brand`) — nunca un endpoint ni una lógica de color
 * nuevos.
 */
describe("customer-detail-content.tsx — RewardGoalStamps recibe los colores reales de la tarjeta", () => {
  const source = readFileSync(join(__dirname, "customer-detail-content.tsx"), "utf-8");

  it("pide /businesses/current/brand — el mismo endpoint que usa Programa", () => {
    expect(source).toContain("/api/proxy/businesses/current/brand");
  });

  it("pasa cardColor, stampAreaColor, stampColor e icon a RewardGoalStamps", () => {
    const start = source.indexOf("<RewardGoalStamps");
    const end = source.indexOf("/>", start);
    const block = source.slice(start, end);

    expect(block).toMatch(/cardColor=\{appearance\?\.\w+\}/);
    expect(block).toMatch(/stampAreaColor=\{appearance\?\.\w+\}/);
    expect(block).toMatch(/stampColor=\{appearance\?\.\w+\}/);
    expect(block).toMatch(/icon=\{appearance\?\.\w+\}/);
  });

  it("un fallo al traer el brand nunca bloquea el resto de la vista (best-effort)", () => {
    // El fetch del overview SÍ tira si falla (`if (!overviewRes.ok) throw`);
    // el del brand deliberadamente no — solo se aplica `if (brandRes.ok)`.
    const brandSection = source.slice(
      source.indexOf("brandRes"),
      source.indexOf("} catch"),
    );
    expect(brandSection).toContain("if (brandRes.ok)");
    expect(brandSection).not.toMatch(/if \(!brandRes\.ok\) throw/);
  });
});
