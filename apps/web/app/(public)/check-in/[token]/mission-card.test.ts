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

/**
 * Solo el CUERPO de `ReturnChallengeDone`, sin los comentarios de las
 * funciones vecinas — que sí hablan de "dos visitas" para explicar por qué el
 * copy no debe hacerlo.
 */
function returnChallengeDoneBody(): string {
  const start = source.indexOf("function ReturnChallengeDone(");
  const end = source.indexOf("\n}", start);
  return source.slice(start, end);
}

describe("Check-in — desafío de vuelta completado", () => {
  it("avisa que volvió a tiempo y ganó un sello extra", () => {
    expect(source).toContain("Volviste a tiempo");
    expect(source).toContain("Ganaste +1 sello extra por tu desafío");
  });

  it("NO lo representa como dos visitas", () => {
    const aviso = returnChallengeDoneBody();
    expect(aviso).not.toMatch(/2 visitas|dos visitas|segunda visita/i);
  });

  it("solo aparece cuando ESA visita lo completó", () => {
    expect(source).toMatch(
      /\{personal\.returnChallengeCompleted \? \(\s*<ReturnChallengeDone/,
    );
  });

  it("va ANTES de la tarjeta, para que el progreso real se lea después", () => {
    const aviso = source.indexOf("<ReturnChallengeDone");
    const tarjeta = source.indexOf("<RewardGoalCard");
    expect(aviso).toBeGreaterThan(-1);
    expect(aviso).toBeLessThan(tarjeta);
  });

  it("no es un modal ni tiene confeti", () => {
    const aviso = returnChallengeDoneBody();
    expect(aviso).not.toMatch(/role="dialog"/);
    expect(aviso).not.toMatch(/confetti|useState|onClick/i);
  });

  it("solo promete el sello cuando bonusApplied es true", () => {
    // El desafío se completó igual (volvió a tiempo, eso es un hecho), pero
    // "+1 sello extra" solo puede afirmarse si ese sello realmente sumó
    // progreso — si no, sería prometer algo que no pasó.
    const aviso = returnChallengeDoneBody();
    expect(aviso).toMatch(/bonusApplied\s*\?[\s\S]*Ganaste \+1 sello extra/);
  });

  it("sin bonusApplied usa el copy neutral, sin mencionar el sello", () => {
    // "¡Completaste tu desafío de vuelta!" es verdad en los dos casos — no
    // depende de si el sello sumó algo.
    expect(source).toContain("¡Completaste tu desafío de vuelta!");
  });

  it("recibe bonusApplied desde personal.returnChallengeBonusApplied", () => {
    expect(source).toMatch(
      /bonusApplied=\{Boolean\(personal\.returnChallengeBonusApplied\)\}/,
    );
  });
});
