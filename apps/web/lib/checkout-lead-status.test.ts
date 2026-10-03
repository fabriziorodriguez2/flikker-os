import {
  isCheckoutPaid,
  parsePreOnboardingCheckoutStatus,
  shouldKeepPolling,
} from "./checkout-lead-status";

describe("parsePreOnboardingCheckoutStatus", () => {
  it("respuesta normal con PAID", () => {
    expect(
      parsePreOnboardingCheckoutStatus({
        status: "PAID",
        plan: "MONTHLY",
        businessId: "biz-1",
      }),
    ).toEqual({ status: "PAID", plan: "MONTHLY", businessId: "biz-1" });
  });

  it("sin ningún checkout todavía: todo null", () => {
    expect(
      parsePreOnboardingCheckoutStatus({ status: null, plan: null, businessId: null }),
    ).toEqual({ status: null, plan: null, businessId: null });
  });

  it("respuesta vacía/corrupta: todo null, nunca inventa un estado", () => {
    for (const value of [null, undefined, "PAID", 42, {}]) {
      expect(parsePreOnboardingCheckoutStatus(value)).toEqual({
        status: value && typeof value === "object" ? null : null,
        plan: null,
        businessId: null,
      });
    }
  });

  it("status desconocido (ej. typo o versión vieja del backend): null, no se inventa", () => {
    expect(
      parsePreOnboardingCheckoutStatus({ status: "SOMETHING_NEW", plan: "MONTHLY" }),
    ).toEqual({ status: null, plan: "MONTHLY", businessId: null });
  });

  it("acepta los siete estados reales del backend", () => {
    for (const status of [
      "PENDING",
      "CHECKOUT_CREATING",
      "CHECKOUT_RECONCILIATION_REQUIRED",
      "CHECKOUT_CREATED",
      "PAID",
      "FAILED",
      "EXPIRED",
    ]) {
      expect(parsePreOnboardingCheckoutStatus({ status }).status).toBe(status);
    }
  });
});

describe("isCheckoutPaid", () => {
  it("solo PAID es true", () => {
    expect(isCheckoutPaid("PAID")).toBe(true);
    expect(isCheckoutPaid("CHECKOUT_CREATED")).toBe(false);
    expect(isCheckoutPaid(null)).toBe(false);
  });
});

describe("shouldKeepPolling — /checkout/success nunca espera para siempre", () => {
  it("PAID: nunca sigue reintentando, sin importar el tiempo", () => {
    expect(shouldKeepPolling("PAID", 0, 20000)).toBe(false);
    expect(shouldKeepPolling("PAID", 50000, 20000)).toBe(false);
  });

  it("no PAID y dentro del tiempo: sigue reintentando", () => {
    expect(shouldKeepPolling("CHECKOUT_CREATED", 5000, 20000)).toBe(true);
    expect(shouldKeepPolling(null, 0, 20000)).toBe(true);
  });

  it("no PAID pero se acabó el tiempo: deja de reintentar — nunca infinito", () => {
    expect(shouldKeepPolling("CHECKOUT_CREATED", 20000, 20000)).toBe(false);
    expect(shouldKeepPolling("PENDING", 999999, 20000)).toBe(false);
  });

  it("nunca manda a onboarding como FREE solo por agotar el tiempo — esta función no decide eso, decide si seguir preguntando", () => {
    // `shouldKeepPolling` en false NO es "andá a /comenzar": la pantalla
    // debe mostrar "todavía se está confirmando" + reintentar manual.
    expect(shouldKeepPolling("CHECKOUT_CREATED", 20000, 20000)).toBe(false);
    expect(isCheckoutPaid("CHECKOUT_CREATED")).toBe(false);
  });
});
