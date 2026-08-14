import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guarda de cableado, no de lógica. `resolveNavSections` ya está probado a
 * fondo en `sidebar-nav.test.ts` — lo que rompió el acceso a Programa no fue
 * esa función, fue que `(panel)/layout.tsx` dejó de pasarle `role` a
 * `<Sidebar>`/`<MobileNav>`. Este repo no tiene infraestructura de rendering
 * (React Testing Library) para montar el layout completo con una sesión
 * simulada, así que esta prueba verifica el cableado real leyendo el código
 * fuente — burdo, pero es exactamente el punto donde el bug vivió, y detecta
 * si alguien vuelve a borrar la prop sin querer.
 */
describe("(panel)/layout.tsx — cablea el rol a la navegación", () => {
  const source = readFileSync(join(__dirname, "layout.tsx"), "utf-8");

  it("pasa role={currentRole} a <Sidebar>", () => {
    const sidebarBlock = source.slice(
      source.indexOf("<Sidebar"),
      source.indexOf("/>", source.indexOf("<Sidebar")),
    );
    expect(sidebarBlock).toMatch(/role=\{currentRole\}/);
  });

  it("pasa role={currentRole} a <MobileNav>", () => {
    const mobileNavBlock = source.slice(
      source.indexOf("<MobileNav"),
      source.indexOf("/>", source.indexOf("<MobileNav")),
    );
    expect(mobileNavBlock).toMatch(/role=\{currentRole\}/);
  });
});
