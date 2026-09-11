import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * La tarjeta es del NEGOCIO, y tiene que ser la MISMA en todas las
 * superficies donde el cliente la ve.
 *
 * Estos guards son de texto fuente a propósito: lo que hay que impedir no es
 * un comportamiento en runtime sino que una superficie deje de pasar un
 * campo de personalización (y entonces ese negocio se vea distinto en
 * check-in que en Mi Flikker), o que alguien resuelva un pedido de diseño
 * creando una segunda tarjeta en vez de reusar `LoyaltyCard`.
 */

const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

const CHECKIN = "app/(public)/check-in/[token]/checkin-client.tsx";
const DETALLE = "app/(public)/mi-flikker/[businessId]/place-detail-client.tsx";

/** Los campos de personalización que el dueño configura y el cliente ve. */
const APPEARANCE_FIELDS = [
  "cardColor",
  "textColor",
  "backgroundImage",
  "stampAreaColor",
  "stampColor",
  "stampIcon",
  "logoUrl",
  "businessName",
  "showBusinessName",
  "stampBackgroundPattern",
  "stampBackgroundOpacity",
] as const;

/** El bloque `appearance={{ … }}` del `<LoyaltyCard>` de ese archivo. */
function appearanceBlock(file: string): string {
  const source = read(file);
  const card = source.indexOf("<LoyaltyCard");
  expect(card).toBeGreaterThan(-1);
  const start = source.indexOf("appearance={{", card);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("}}", start));
}

describe("LoyaltyCard — la misma tarjeta personalizada en todas las superficies", () => {
  it.each([
    ["check-in", CHECKIN],
    ["detalle del lugar", DETALLE],
  ])("%s pasa TODOS los campos de personalización", (_label, file) => {
    const block = appearanceBlock(file);
    for (const field of APPEARANCE_FIELDS) {
      expect(block).toContain(`${field}:`);
    }
  });

  it("check-in y detalle configuran exactamente el mismo set de campos", () => {
    const fieldsOf = (file: string) =>
      APPEARANCE_FIELDS.filter((f) => appearanceBlock(file).includes(`${f}:`));

    expect(fieldsOf(CHECKIN)).toEqual(fieldsOf(DETALLE));
  });

  /*
    El progreso sale del backend, nunca del DOM ni de una cuenta propia de la
    pantalla: las dos superficies leen los mismos campos del read-model.
  */
  it.each([
    ["check-in", CHECKIN],
    ["detalle del lugar", DETALLE],
  ])("%s toma el progreso del read-model, no de otro lado", (_label, file) => {
    const source = read(file);
    const card = source.slice(
      source.indexOf("<LoyaltyCard"),
      source.indexOf("/>", source.indexOf("<LoyaltyCard")),
    );
    expect(card).toMatch(/progress=\{[^}]*progressVisits/);
    expect(card).toMatch(/target=\{[^}]*targetAdditionalVisits/);
  });

  it("ninguna superficie del cliente define su propia tarjeta paralela", () => {
    for (const file of [CHECKIN, DETALLE]) {
      const source = read(file);
      // Reusa el componente compartido…
      expect(source).toContain('from "@/components/public/loyalty-card"');
      // …y no dibuja su propia grilla de sellos por fuera de él.
      expect(source).not.toContain("RewardGoalStamps");
    }
  });
});
