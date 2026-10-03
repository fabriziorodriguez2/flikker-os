import {
  parsePendingUpgradePlanFromApi,
  parsePendingUpgradePlanFromSearchParams,
} from "./pending-upgrade-plan";

/**
 * Intención de upgrade Pro, capturada en `/signup?plan=PRO&billing=...` y
 * leída de vuelta desde `GET /auth/me` para decidir si `/upgrade` precarga
 * mensual o anual (Parte 5D).
 */
describe("parsePendingUpgradePlanFromSearchParams", () => {
  it("plan=PRO&billing=MONTHLY", () => {
    expect(
      parsePendingUpgradePlanFromSearchParams(
        new URLSearchParams("plan=PRO&billing=MONTHLY"),
      ),
    ).toBe("MONTHLY");
  });

  it("plan=PRO&billing=YEARLY", () => {
    expect(
      parsePendingUpgradePlanFromSearchParams(
        new URLSearchParams("plan=PRO&billing=YEARLY"),
      ),
    ).toBe("YEARLY");
  });

  it("signup normal, sin query params: null", () => {
    expect(
      parsePendingUpgradePlanFromSearchParams(new URLSearchParams("")),
    ).toBeNull();
  });

  it("billing inválido: null, nunca activa Pro con un valor desconocido", () => {
    for (const billing of ["monthly", "WEEKLY", "", "<script>"]) {
      expect(
        parsePendingUpgradePlanFromSearchParams(
          new URLSearchParams(`plan=PRO&billing=${billing}`),
        ),
      ).toBeNull();
    }
  });

  it("plan distinto de PRO: null aunque billing sea válido", () => {
    expect(
      parsePendingUpgradePlanFromSearchParams(
        new URLSearchParams("plan=ENTERPRISE&billing=MONTHLY"),
      ),
    ).toBeNull();
  });
});

describe("parsePendingUpgradePlanFromApi", () => {
  it("lee MONTHLY/YEARLY tal como los devuelve /auth/me", () => {
    expect(parsePendingUpgradePlanFromApi("MONTHLY")).toBe("MONTHLY");
    expect(parsePendingUpgradePlanFromApi("YEARLY")).toBe("YEARLY");
  });

  it("null, undefined o cualquier otro valor: null, nunca inventa un plan", () => {
    for (const value of [null, undefined, "WEEKLY", 1, {}]) {
      expect(parsePendingUpgradePlanFromApi(value)).toBeNull();
    }
  });
});
