import {
  buildProCheckoutRequestBody,
  parseProCheckoutResponse,
  CHECKOUT_GENERIC_ERROR_MESSAGE,
} from "./pro-checkout";

/**
 * Lógica pura detrás de `useProCheckout` — sin DOM, sin fetch real. Lo que
 * importa: el body nunca lleva más que el plan, y una respuesta sin
 * `checkoutUrl` usable siempre se trata como error, nunca como un checkout
 * a medias.
 */
describe("buildProCheckoutRequestBody", () => {
  it("el body es exactamente { plan } — nada de businessId, userId, monto, moneda, correo ni teléfono", () => {
    expect(buildProCheckoutRequestBody("MONTHLY")).toEqual({ plan: "MONTHLY" });
    expect(Object.keys(buildProCheckoutRequestBody("YEARLY"))).toEqual(["plan"]);
  });

  it("respeta el plan pedido, mensual y anual por separado", () => {
    expect(buildProCheckoutRequestBody("MONTHLY").plan).toBe("MONTHLY");
    expect(buildProCheckoutRequestBody("YEARLY").plan).toBe("YEARLY");
  });
});

describe("parseProCheckoutResponse", () => {
  it("200 con checkoutUrl: éxito", () => {
    const result = parseProCheckoutResponse(true, {
      checkoutUrl: "https://mercadopago.com/checkout/abc",
      status: "CHECKOUT_CREATED",
    });
    expect(result).toEqual({
      checkoutUrl: "https://mercadopago.com/checkout/abc",
    });
  });

  it("200 sin checkoutUrl (respuesta rota): se trata como error, nunca se inventa una URL", () => {
    const result = parseProCheckoutResponse(true, { status: "CHECKOUT_CREATED" });
    expect("errorMessage" in result).toBe(true);
  });

  it("200 con checkoutUrl vacío: también es error", () => {
    const result = parseProCheckoutResponse(true, { checkoutUrl: "" });
    expect("errorMessage" in result).toBe(true);
  });

  it("error del backend con message: se propaga tal cual (ej. “Este negocio ya tiene Pro activo.”)", () => {
    const result = parseProCheckoutResponse(false, {
      message: "Este negocio ya tiene Pro activo.",
    });
    expect(result).toEqual({ errorMessage: "Este negocio ya tiene Pro activo." });
  });

  it("error sin message (ej. caída de red, body vacío): mensaje genérico, nunca un mensaje técnico", () => {
    expect(parseProCheckoutResponse(false, null)).toEqual({
      errorMessage: CHECKOUT_GENERIC_ERROR_MESSAGE,
    });
    expect(parseProCheckoutResponse(false, {})).toEqual({
      errorMessage: CHECKOUT_GENERIC_ERROR_MESSAGE,
    });
  });

  it("el mensaje genérico es el copy acordado con el usuario", () => {
    expect(CHECKOUT_GENERIC_ERROR_MESSAGE).toBe(
      "No pudimos abrir el checkout. Probá de nuevo.",
    );
  });
});
