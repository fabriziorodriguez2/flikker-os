import {
  isAtPlanLimit,
  parseFreePlanUsage,
  type FreePlanUsage,
} from "./free-plan-usage";

describe("parseFreePlanUsage", () => {
  const valid: FreePlanUsage = {
    current: 50,
    limit: 50,
    blockedCustomersLast7Days: 4,
    blockedCustomersThisMonth: 11,
  };

  it("acepta la respuesta completa tal cual", () => {
    expect(parseFreePlanUsage(valid)).toEqual(valid);
  });

  /*
    `null` es la respuesta NORMAL para Pro y para negocios sin tope — no un
    error. Es lo que hace que todas las superficies se apaguen solas al
    actualizar el plan.
  */
  it("null (Pro o sin tope) queda en null", () => {
    expect(parseFreePlanUsage(null)).toBeNull();
    expect(parseFreePlanUsage(undefined)).toBeNull();
  });

  /*
    Rellenar un campo faltante con 0 haría que la UI afirme "no hubo nadie
    bloqueado" cuando en realidad no sabemos. Preferimos no mostrar nada.
  */
  it("si falta cualquier número devuelve null, nunca completa con ceros", () => {
    for (const key of [
      "current",
      "limit",
      "blockedCustomersLast7Days",
      "blockedCustomersThisMonth",
    ] as const) {
      const partial: Record<string, unknown> = { ...valid };
      delete partial[key];
      expect(parseFreePlanUsage(partial)).toBeNull();
    }
  });

  it("rechaza tipos equivocados", () => {
    expect(parseFreePlanUsage({ ...valid, current: "50" })).toBeNull();
    expect(parseFreePlanUsage("50/50")).toBeNull();
    expect(parseFreePlanUsage([])).toBeNull();
  });
});

describe("isAtPlanLimit", () => {
  it("en el tope es true", () => {
    expect(
      isAtPlanLimit({
        current: 50,
        limit: 50,
        blockedCustomersLast7Days: 0,
        blockedCustomersThisMonth: 0,
      }),
    ).toBe(true);
  });

  it("debajo del tope es false", () => {
    expect(
      isAtPlanLimit({
        current: 49,
        limit: 50,
        blockedCustomersLast7Days: 0,
        blockedCustomersThisMonth: 0,
      }),
    ).toBe(false);
  });

  /*
    Pasarse es posible: un negocio que venía de Pro puede quedar arriba del
    tope de Free. Sigue siendo "en el límite".
  */
  it("por encima del tope también es true", () => {
    expect(
      isAtPlanLimit({
        current: 73,
        limit: 50,
        blockedCustomersLast7Days: 2,
        blockedCustomersThisMonth: 5,
      }),
    ).toBe(true);
  });
});
