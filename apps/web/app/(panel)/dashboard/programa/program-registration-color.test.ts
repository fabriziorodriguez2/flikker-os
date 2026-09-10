import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `Business.checkinBackgroundColor` dejó de pintar cualquier superficie
 * customer-facing cuando Flikker pasó a ser el marco y el negocio el
 * contenido. Un control que el dueño toca, guarda, y no cambia nada en
 * ninguna pantalla es peor que no tener control: erosiona la confianza en
 * todo el resto del panel.
 *
 * Este guard es de texto fuente a propósito. Lo que hay que impedir no es un
 * comportamiento en runtime sino que alguien vuelva a CABLEAR el campo en el
 * formulario — que es lo que pasaría al copiar la sección para agregar otra
 * opción de color.
 */
const DIR = __dirname;
const read = (f: string) => readFileSync(join(DIR, f), "utf8");

describe("Programa → Página de inscripción", () => {
  const source = read("program-registration-section.tsx");

  it("no ofrece ningún control para editar el fondo de la experiencia", () => {
    // Sin `<input type="color">` ni ningún setter de estado para ese campo.
    expect(source).not.toMatch(/type="color"/);
    expect(source).not.toMatch(/setBackgroundColor/);
  });

  it("no escribe checkinBackgroundColor al guardar", () => {
    const save = source.slice(
      source.indexOf("async function save()"),
      source.indexOf("const previewLanding"),
    );
    // La forma de CLAVE (`checkinBackgroundColor:`) es lo que importa; el
    // comentario que explica por qué ya no se manda nombra el campo y no
    // debería hacer fallar el guard.
    expect(save).not.toMatch(/checkinBackgroundColor\s*:/);
  });

  /*
    La columna sigue existiendo con los valores que cada negocio ya eligió: no
    se borra ni se migra. Lo único que cambió es que el panel dejó de
    escribirla, así que la preview la manda explícitamente en null.
  */
  it("la preview no reintroduce el color por la puerta de atrás", () => {
    expect(source).toMatch(/checkinBackgroundColor:\s*null/);
  });

  it("el color de marca queda como la única configuración cromática", () => {
    expect(source).toMatch(/Color de marca/);
    expect(source).not.toMatch(/Color de la experiencia/);
  });
});
