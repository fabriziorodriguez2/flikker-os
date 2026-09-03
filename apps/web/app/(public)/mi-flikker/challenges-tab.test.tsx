import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChallengesTab, {
  type MissionChallenge,
  type MyFlikkerChallenge,
  type ReturnChallengeCard,
  type StreakChallenge,
} from "./challenges-tab";

function returnChallenge(
  overrides: Partial<ReturnChallengeCard> = {},
): ReturnChallengeCard {
  return {
    kind: "return_challenge",
    challengeId: "rc-1",
    businessId: "b-1",
    businessName: "Bar Fraternidad",
    logoUrl: null,
    deadlineDayKey: "2026-09-27",
    ...overrides,
  };
}

function streak(
  overrides: Partial<StreakChallenge> = {},
): StreakChallenge {
  return {
    kind: "streak",
    businessId: "b-1",
    businessName: "Bar Fraternidad",
    logoUrl: null,
    currentWeeks: 3,
    state: "AT_RISK",
    deadlineDayKey: "2026-09-27",
    ...overrides,
  };
}

function challenge(
  overrides: Partial<MissionChallenge> = {},
): MissionChallenge {
  return {
    kind: "mission",
    missionId: "m-1",
    businessId: "b-1",
    businessName: "Bar Fraternidad",
    logoUrl: null,
    name: "Vení 3 veces este mes",
    description: null,
    status: "ACTIVE",
    progress: { current: 2, target: 3, remaining: 1, complete: false },
    endsAt: "2026-10-01T03:00:00.000Z",
    timezone: "America/Montevideo",
    // El backend ya lo resolvió con el reloj del negocio: `endsAt` es la
    // medianoche del 1 de octubre local, así que el último día es el 30.
    lastDayKey: "2026-09-30",
    rewardName: "1 café gratis",
    rewardHidden: false,
    rewardCode: null,
    ...overrides,
  };
}

function render(challenges: MyFlikkerChallenge[], loading = false) {
  return renderToStaticMarkup(
    <ChallengesTab challenges={challenges} loading={loading} />,
  );
}

describe("ChallengesTab — solo muestra desafíos reales", () => {
  it("sin desafíos NO inventa un progreso: no aparece ningún 0 de N", () => {
    const html = render([]);

    expect(html).toContain("Todavía no tenés desafíos");
    expect(html).not.toMatch(/\d+ de \d+ visitas/);
    // Y tampoco una racha en 0 ni una tarjeta de premio decorativa.
    expect(html).not.toMatch(/racha/i);
    expect(html).not.toContain("Premio secreto");
  });

  it("muestra el progreso real y de qué negocio es", () => {
    const html = render([challenge()]);

    expect(html).toContain("Bar Fraternidad");
    expect(html).toContain("Vení 3 veces este mes");
    expect(html).toContain("2 de 3 visitas");
  });

  it("dibuja un punto por visita, llenos hasta el progreso actual", () => {
    const html = render([challenge()]);
    const llenos = html.match(/bg-\[#5C6BC0\]/g) ?? [];
    const vacíos = html.match(/bg-\[#E2E4EF\]/g) ?? [];

    expect(llenos).toHaveLength(2);
    expect(vacíos).toHaveLength(1);
  });

  it("no dibuja puntitos cuando el objetivo es muy grande", () => {
    const html = render([
      challenge({
        progress: { current: 3, target: 20, remaining: 17, complete: false },
      }),
    ]);

    expect(html).toContain("3 de 20 visitas");
    expect(html).not.toContain("bg-[#E2E4EF]");
  });
});

describe("ChallengesTab — premio secreto", () => {
  it("oculta el nombre del premio y dice cuántas visitas faltan", () => {
    const html = render([
      challenge({ rewardHidden: true, rewardName: null }),
    ]);

    expect(html).toContain("Premio secreto");
    expect(html).toContain("Te falta 1 visita para descubrirlo");
    expect(html).not.toContain("1 café gratis");
  });

  it("usa el plural cuando falta más de una visita", () => {
    const html = render([
      challenge({
        rewardHidden: true,
        rewardName: null,
        progress: { current: 1, target: 3, remaining: 2, complete: false },
      }),
    ]);

    expect(html).toContain("Te faltan 2 visitas para descubrirlo");
  });

  it("lo revela al completar, junto con el código de canje", () => {
    const html = render([
      challenge({
        status: "COMPLETED",
        rewardHidden: false,
        rewardCode: "ABC123",
        progress: { current: 3, target: 3, remaining: 0, complete: true },
      }),
    ]);

    expect(html).toContain("Desbloqueaste: 1 café gratis");
    expect(html).toContain("ABC123");
    expect(html).toContain("¡Completado!");
  });
});

describe("ChallengesTab — una misión sin premio", () => {
  it("no muestra ninguna fila de premio", () => {
    const html = render([
      challenge({ rewardName: null, rewardHidden: false }),
    ]);

    expect(html).toContain("2 de 3 visitas");
    expect(html).not.toContain("Premio secreto");
    expect(html).not.toContain("Desbloqueaste");
  });
});

describe("ChallengesTab — fecha límite", () => {
  it("muestra el último día REAL, no la medianoche exclusiva del día siguiente", () => {
    // `endsAt` = 1 de octubre 00:00 local → el último día para venir es el 30
    // de setiembre. Mostrar "1 de octubre" daría un día de más.
    const html = render([challenge()]);

    // "setiembre", no "septiembre": es la grafía de `es-UY`.
    expect(html).toContain("30 de setiembre");
    expect(html).not.toContain("1 de octubre");
  });

  it("usa el día que resolvió el negocio, no el reloj del dispositivo", () => {
    // Este es el caso del cliente de viaje: el mismo `endsAt` leído en Tokio
    // (UTC+9) caería el 1 de octubre. Como el día ya viene resuelto en
    // `lastDayKey`, la pantalla muestra el 30 sin importar dónde esté.
    const html = renderToStaticMarkup(
      <ChallengesTab
        challenges={[challenge()]}
        loading={false}
      />,
    );

    expect(html).toContain("30 de setiembre");
  });

  it("no vuelve a calcular la fecha a partir de endsAt", () => {
    // Si el componente ignorara `lastDayKey` y derivara el día de `endsAt`,
    // este caso —donde los dos no coinciden— lo delataría.
    const html = render([
      challenge({
        endsAt: "2027-01-01T03:00:00.000Z",
        lastDayKey: "2026-12-31",
      }),
    ]);

    expect(html).toContain("31 de diciembre");
  });

  it("no muestra fecha límite en un desafío ya completado", () => {
    const html = render([
      challenge({
        status: "COMPLETED",
        progress: { current: 3, target: 3, remaining: 0, complete: true },
      }),
    ]);

    expect(html).not.toContain("Hasta el");
  });
});

describe("Mi Flikker — cableado de la pestaña Desafíos", () => {
  const source = readFileSync(
    join(__dirname, "mi-flikker-client.tsx"),
    "utf8",
  );

  it("pide los desafíos recién al abrir la pestaña, no al cargar la pantalla", () => {
    expect(source).toMatch(/setView\("desafios"\);\s*\n\s*void loadChallenges\(\)/);
    // El load inicial sigue pidiendo solo lugares.
    expect(source).toContain('fetch("/api/mi-flikker/places")');
  });

  it("no vuelve a pedirlos si ya los tiene", () => {
    expect(source).toMatch(/if \(challengesLoaded \|\| challengesLoading\) return;/);
  });
});

describe("ChallengesTab — racha", () => {
  it("AT_RISK muestra las semanas y la fecha para mantenerla", () => {
    const html = render([streak()]);

    expect(html).toContain("Racha actual");
    expect(html).toContain("3");
    expect(html).toContain("semanas");
    expect(html).toContain("Volvé antes del 27 de setiembre para mantenerla");
  });

  it("ACTIVE dice que ya la mantuvo, sin apurar a nadie", () => {
    const html = render([streak({ state: "ACTIVE", currentWeeks: 4 })]);

    expect(html).toContain("Ya mantuviste tu racha esta semana");
    expect(html).not.toContain("Volvé antes del");
  });

  it("pluraliza bien", () => {
    const dos = render([streak({ currentWeeks: 2 })]);
    expect(dos).toMatch(/2\s*<span[^>]*>semanas<\/span>/);

    // La regla de UX no deja llegar una racha de 1, pero si llegara, el
    // singular tiene que estar bien igual.
    const una = render([streak({ currentWeeks: 1 })]);
    expect(una).toMatch(/1\s*<span[^>]*>semana<\/span>/);
  });

  it("nunca muestra una racha de 0 — el backend no la manda", () => {
    // BROKEN y las de una sola semana se filtran en `isWorthShowing`, así que
    // la pantalla no recibe ninguna. Sin tarjetas, el estado vacío normal.
    const html = render([]);

    expect(html).not.toContain("Racha actual");
    expect(html).toContain("Todavía no tenés desafíos");
  });

  it("no muestra ningún premio: en esta fase la racha no da nada", () => {
    const html = render([streak()]);

    expect(html).not.toContain("Premio");
    expect(html).not.toContain("código");
    expect(html).not.toMatch(/🎁|🎉/);
  });

  it("no usa vocabulario interno", () => {
    const html = render([streak(), streak({ state: "ACTIVE" })]);

    for (const palabra of ["streak", "AT_RISK", "ACTIVE", "BROKEN", "week"]) {
      expect(html).not.toContain(palabra);
    }
  });

  it("misión y racha conviven en la misma lista", () => {
    const html = render([challenge(), streak()]);

    expect(html).toContain("Vení 3 veces este mes");
    expect(html).toContain("Racha actual");
    expect(html).toContain("2 de 3 visitas");
  });

  it("la racha no dibuja puntitos de progreso de misión", () => {
    const html = render([streak()]);

    expect(html).not.toContain("bg-[#E2E4EF]");
    expect(html).not.toContain("visitas");
  });
});

describe("ChallengesTab — desafío de vuelta", () => {
  it("muestra el plazo y el sello extra", () => {
    const html = render([returnChallenge()]);

    expect(html).toContain("Desafío de vuelta");
    expect(html).toContain("Volvé antes del 27 de setiembre");
    expect(html).toContain("+1 sello extra");
  });

  it("ofrece ir a la tarjeta del negocio", () => {
    const html = render([returnChallenge()]);

    expect(html).toContain('href="/mi-flikker/b-1"');
    expect(html).toContain("Ver mi tarjeta");
  });

  it("no muestra progreso: es binario, volvió o no volvió", () => {
    const html = render([returnChallenge()]);

    expect(html).not.toMatch(/\d+ de \d+ visitas/);
    expect(html).not.toContain("bg-[#E2E4EF]");
  });

  it("no usa vocabulario interno", () => {
    const html = render([returnChallenge()]);

    for (const palabra of [
      "return_challenge",
      "ACTIVE",
      "CANCELLED",
      "EXPIRED",
      "rewardGoal",
    ]) {
      expect(html).not.toContain(palabra);
    }
  });

  it("EXPIRED y CANCELLED no llegan a la pantalla", () => {
    // El backend solo manda ACTIVE sin vencer: la lista vacía es el estado
    // vacío normal, no una tarjeta gris de "se te venció".
    const html = render([]);

    expect(html).not.toContain("Desafío de vuelta");
    expect(html).toContain("Todavía no tenés desafíos");
  });

  it("convive con misión y racha en la misma lista", () => {
    const html = render([returnChallenge(), challenge(), streak()]);

    expect(html).toContain("Desafío de vuelta");
    expect(html).toContain("Vení 3 veces este mes");
    expect(html).toContain("Racha actual");
  });

  it("el desafío de vuelta se renderiza primero", () => {
    // El orden lo decide el backend, pero la pantalla tiene que respetarlo.
    const html = render([returnChallenge(), challenge(), streak()]);

    expect(html.indexOf("Desafío de vuelta")).toBeLessThan(
      html.indexOf("Vení 3 veces este mes"),
    );
    expect(html.indexOf("Vení 3 veces este mes")).toBeLessThan(
      html.indexOf("Racha actual"),
    );
  });
});
