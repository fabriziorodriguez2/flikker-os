import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard de código fuente — el componente es parte de un cliente con estado
 * grande, así que no se renderiza aislado (misma convención que el resto de
 * los tests de esta pantalla).
 */
const source = readFileSync(join(__dirname, "checkin-client.tsx"), "utf8");

describe("Check-in — sellos y misiones contando la misma visita", () => {
  it("aclara que las visitas cuentan para las dos cosas", () => {
    expect(source).toContain("Tus visitas también cuentan para este desafío");
  });

  it("NO afirma que fue 'esta visita'", () => {
    // El componente no recibe deltas por evento: sabe que hay una tarjeta
    // activa, no que ESTA visita puntual haya movido las dos. Y la pantalla
    // también se renderiza en lecturas, sin ninguna visita recién ocurrida.
    // Afirmarlo sería decir algo que acá no se puede saber.
    expect(source).not.toContain("Esta visita también contó");
    expect(source).not.toMatch(/Esta visita.*desafío/);
  });

  it("solo lo aclara cuando además hay una tarjeta de sellos en curso", () => {
    // Sin tarjeta activa no hay dos contadores subiendo, así que el "también"
    // no tendría a qué referirse.
    expect(source).toMatch(
      /hasStampCard=\{Boolean\(personal\.rewardGoal\?\.goal\)\}/,
    );
    expect(source).toMatch(/\{hasStampCard \? \(/);
  });

  it("no abre un modal ni una explicación larga", () => {
    const missionCard = source.slice(
      source.indexOf("function MissionCard("),
      source.indexOf("function RewardGoalCard("),
    );
    expect(missionCard).not.toMatch(/role="dialog"/);
    expect(missionCard).not.toMatch(/useState/);
    expect(missionCard).not.toMatch(/onClick/);
  });

  it("no inventa una tarjeta cuando el negocio no tiene misiones", () => {
    // `?? []` sobre un array vacío no renderiza nada — nunca un "0 de 3"
    // decorativo.
    expect(source).toMatch(/\(personal\.missions \?\? \[\]\)\.map/);
  });

  it("esconde el premio secreto hasta completar", () => {
    const missionCard = source.slice(
      source.indexOf("function MissionCard("),
      source.indexOf("function RewardGoalCard("),
    );
    expect(missionCard).toContain("Premio secreto");
    expect(missionCard).toMatch(/mission\.rewardHidden \?/);
  });
});
