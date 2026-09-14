import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guarda de copy, mismo criterio que
 * `program-design-tab-responsive.test.ts`: este repo no tiene
 * infraestructura de rendering para el panel, así que el contrato se prueba
 * leyendo el código fuente.
 *
 * Lo que fija: la distinción BENEFICIO (el objeto — qué recibe el cliente)
 * vs. REGLA (el momento — cuándo Flikker lo entrega o cuándo el cliente
 * avanza más rápido). Las dos secciones se llamaban "Incentivos" y
 * "Beneficios", nombres tan parecidos que un dueño no podía saber cuál
 * abrir. Estos tests existen para que ese solapamiento no vuelva.
 */
describe("Programa → Configuración: beneficio (objeto) vs. regla (momento)", () => {
  /**
   * Se lee el archivo SIN comentarios. Los comentarios de estos archivos
   * explican de qué se renombró cada cosa, así que citan los nombres viejos
   * a propósito — buscarlos ahí daría falsos positivos justo en los tests
   * que verifican que un nombre viejo desapareció.
   */
  const read = (file: string) =>
    readFileSync(join(__dirname, file), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");

  const config = read("program-configuracion-tab.tsx");
  const rules = read("program-incentives-section.tsx");
  const benefits = read("program-benefits-tab.tsx");

  describe("menú lateral", () => {
    it('la sección se llama "Reglas y bonos"', () => {
      expect(config).toContain('label: "Reglas y bonos"');
    });

    it('"Incentivos" ya no es una etiqueta visible de la navegación', () => {
      expect(config).not.toContain('label: "Incentivos"');
    });

    it('"Beneficios" conserva su nombre', () => {
      expect(config).toContain('label: "Beneficios"');
    });

    it("cada entrada lleva el subtítulo acordado", () => {
      const expected = [
        ["Tarjeta digital", "Diseño y colores de la tarjeta"],
        ["Página de inscripción", "Apariencia del formulario"],
        ["Términos y condiciones", "Bases legales del programa"],
        ["Reglas y bonos", "Cuándo Flikker acelera o reactiva"],
        ["Beneficios", "Premios y ofertas para clientes"],
      ];
      for (const [label, description] of expected) {
        const block = config.slice(
          config.indexOf(`label: "${label}"`),
          config.indexOf(`label: "${label}"`) + 200,
        );
        expect(block).toContain(`description: "${description}"`);
      }
    });

    /*
      Los `key` viajan en la URL (`?section=`). El renombre es de etiqueta
      visible: si alguien los cambia, los links guardados por los dueños
      dejan de abrir la sección correcta.
    */
    it("las keys de ruta no se renombraron junto con las etiquetas", () => {
      expect(config).toContain('key: "incentivos"');
      expect(config).toContain('key: "premios"');
    });
  });

  describe("Reglas y bonos", () => {
    it("abre con el callout que separa premio de regla", () => {
      expect(rules).toContain("Los beneficios son los premios.");
      expect(rules).toContain(
        "Las reglas definen cuándo se usan o cuándo un cliente avanza más",
      );
    });

    it('el tope mensual se llama "Límite mensual de reactivación", no "Presupuesto"', () => {
      expect(rules).toContain('title="Límite mensual de reactivación"');
      expect(rules).not.toContain("Presupuesto de reactivación automática");
    });

    it("el tope se describe como cantidad de beneficios, no como dinero", () => {
      expect(rules).toContain(
        "Máximo de beneficios que Flikker puede entregar automáticamente por mes",
      );
    });

    it('el catálogo de reglas se llama "Bonos y reglas especiales"', () => {
      expect(rules).toContain('title="Bonos y reglas especiales"');
      expect(rules).not.toContain('title="Incentivos"');
    });

    it('el CTA es "Nueva regla"', () => {
      expect(rules).toContain("Nueva regla");
      expect(rules).not.toContain("Nuevo incentivo");
    });

    it("ningún texto visible le dice “incentivo” al usuario", () => {
      // El identificador `incentive`/`incentives` sigue vivo en el código y
      // en el endpoint — lo que no puede volver es la palabra en español
      // mirando al dueño.
      expect(rules).not.toMatch(/[Ii]ncentivos?\b/);
    });
  });

  describe("Beneficios", () => {
    it("la intro presenta el beneficio como objeto y los usos como decisión aparte", () => {
      expect(benefits).toContain(
        "Creá los premios y ofertas de tu negocio. Después decidí en qué momentos puede usarlos Flikker",
      );
    });

    it('los usos se agrupan bajo "Dónde se usa este beneficio"', () => {
      expect(benefits).toContain("Dónde se usa este beneficio");
      expect(benefits).not.toContain("Se usa para");
    });

    it("el grupo explica qué se está eligiendo", () => {
      expect(benefits).toContain(
        "Elegí en qué momentos Flikker puede entregar u ofrecer",
      );
    });

    it("cada uso dice cuándo se entrega, en una línea", () => {
      expect(benefits).toContain("Se entrega al completar la tarjeta.");
      expect(benefits).toContain("Se entrega una sola vez en la primera visita.");
      expect(benefits).toContain(
        "Flikker puede ofrecerlo a clientes que dejaron de",
      );
      expect(benefits).toContain(
        "Se muestra como beneficio disponible durante el",
      );
    });

    /*
      "Activo en el check-in" se lee dentro del grupo, pero sigue siendo un
      botón: es un slot único por negocio, no un cuarto checkbox. Si alguien
      lo convierte en `<input type="checkbox">` la UI empieza a mentir.
    */
    it("“Activo en el check-in” sigue siendo un toggle aparte, no un checkbox más", () => {
      const group = benefits.slice(
        benefits.indexOf("Dónde se usa este beneficio"),
        benefits.indexOf("</li>", benefits.indexOf("Dónde se usa este beneficio")),
      );
      expect(group).toContain("Activo en el check-in");
      expect(group).toContain("onSetActive(benefit.id, !benefit.active)");
      const checkboxes = group.match(/type="checkbox"/g) ?? [];
      expect(checkboxes).toHaveLength(3);
    });
  });
});
