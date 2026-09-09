import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard de código fuente del espacio personal — la pantalla es un cliente con
 * estado grande y no se renderiza aislada (misma convención que el resto de
 * los tests de acá).
 *
 * Desde la convergencia de desafíos, el markup de misiones y del desafío de
 * vuelta vive en `ChallengeRow` (con sus propios tests de comportamiento).
 * Lo que se sigue verificando acá es lo que es propio de ESTA pantalla: qué
 * se le pasa a cada fila y en qué orden se leen los bloques.
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
    // no tendría a qué referirse. `activeGoal` es el mismo dato leído una vez
    // arriba (`personal.rewardGoal?.goal`), compartido por los bloques que
    // dependen del estado de la tarjeta.
    expect(source).toMatch(/const activeGoal = personal\.rewardGoal\?\.goal/);
    expect(source).toMatch(
      /footnote=\{\s*activeGoal\s*\?\s*"Tus visitas también cuentan para este desafío"/,
    );
  });

  it("no inventa una tarjeta cuando el negocio no tiene misiones", () => {
    // `?? []` sobre un array vacío no renderiza nada — nunca un "0 de 3"
    // decorativo.
    expect(source).toMatch(/\(personal\.missions \?\? \[\]\)\.map/);
  });

  it("esconde el premio secreto hasta completar", () => {
    const reward = source.slice(
      source.indexOf("function missionReward("),
      source.indexOf("function RewardUnlockedHero("),
    );
    expect(reward).toContain("Premio secreto");
    expect(reward).toMatch(/mission\.rewardHidden/);
    // Sin premio configurado no se inventa ninguna fila.
    expect(reward).toContain("if (!mission.rewardName) return null;");
  });
});

describe("Check-in — desafío de vuelta completado", () => {
  it("avisa que volvió a tiempo y ganó un sello extra", () => {
    expect(source).toContain("Volviste a tiempo");
    expect(source).toContain("Ganaste +1 sello extra por tu desafío");
  });

  it("NO lo representa como dos visitas", () => {
    expect(source).not.toMatch(/2 visitas|dos visitas|segunda visita/i);
  });

  it("solo aparece cuando ESA visita lo completó", () => {
    expect(source).toMatch(
      /\{personal\.returnChallengeCompleted \? \(\s*<ChallengeRow/,
    );
  });

  it("solo promete el sello cuando bonusApplied es true", () => {
    // El desafío se completó igual (volvió a tiempo, eso es un hecho), pero
    // "+1 sello extra" solo puede afirmarse si ese sello realmente sumó
    // progreso — si no, sería prometer algo que no pasó.
    expect(source).toMatch(
      /personal\.returnChallengeBonusApplied\s*\?\s*"Ganaste \+1 sello extra por tu desafío\."/,
    );
    expect(source).toContain("¡Completaste tu desafío de vuelta!");
  });
});

describe("Check-in — jerarquía de la pantalla", () => {
  /**
   * El orden es la decisión de producto de esta pantalla: qué pasó con la
   * visita → premio si se desbloqueó → tarjeta activa → desafíos → feedback.
   */
  it("el premio recién desbloqueado va antes que la tarjeta y que los desafíos", () => {
    const premio = source.indexOf("<RewardUnlockedHero");
    const tarjeta = source.indexOf("<LoyaltyCard");
    const desafio = source.indexOf("<ChallengeRow");
    expect(premio).toBeGreaterThan(-1);
    expect(premio).toBeLessThan(tarjeta);
    expect(premio).toBeLessThan(desafio);
  });

  it("los desafíos van DESPUÉS de la tarjeta: primero el progreso real", () => {
    expect(source.indexOf("<ChallengeRow")).toBeGreaterThan(
      source.indexOf("<LoyaltyCard"),
    );
  });

  it("el feedback va después de los desafíos", () => {
    expect(source.indexOf("<CheckinFeedbackCard")).toBeGreaterThan(
      source.indexOf("<ChallengeRow"),
    );
  });

  it("nunca dibuja una tarjeta nueva 0/N después de desbloquear", () => {
    // El ciclo siguiente nace con la próxima Visit válida; anticiparlo sería
    // mostrar un progreso que el backend todavía no tiene.
    const hero = source.slice(
      source.indexOf("function RewardUnlockedHero("),
      source.indexOf("// ── Layout primitives"),
    );
    expect(hero).toContain("SlideToReveal");
    expect(hero).not.toMatch(/<LoyaltyCard/);
    expect(hero).not.toMatch(/progress=\{0\}/);
  });
});
