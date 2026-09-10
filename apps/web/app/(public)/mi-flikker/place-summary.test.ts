import { placeSummary, type MyFlikkerPlace } from "./mi-flikker-client";

/**
 * Las líneas de una fila de Lugares.
 *
 * Se testea acá y no en el render porque el riesgo real de esta pantalla no
 * es el layout: es escribir un número que el backend no dijo. Un "0 de 5
 * sellos" en un lugar sin tarjeta, o un progreso que no coincide con el que
 * muestra la tarjeta al entrar, son bugs que el cliente ve como una mentira
 * del producto.
 */

const base: MyFlikkerPlace = {
  businessId: "b1",
  businessName: "Lugar",
  logoUrl: null,
  primaryColor: "#D9502B",
  loyaltyCardColor: null,
  loyaltyCardTextColor: null,
  loyaltyCardBackgroundImage: null,
  loyaltyStampAreaColor: null,
  loyaltyStampColor: null,
  loyaltyStampIcon: null,
  loyaltyShowBusinessName: true,
  loyaltyStampBackgroundPattern: null,
  loyaltyStampBackgroundOpacity: null,
  visitsTotal: 0,
  lastVisitAt: null,
  rewardGoal: null,
  benefitAvailable: null,
};

const goal = (over: Partial<NonNullable<MyFlikkerPlace["rewardGoal"]>> = {}) => ({
  incentiveName: "Café gratis",
  progressVisits: 4,
  targetAdditionalVisits: 6,
  remainingVisits: 2,
  ...over,
});

const benefit = { name: "2x1", code: "AAA", expiresAt: null };

describe("placeSummary", () => {
  it("A · tarjeta activa: el progreso es la línea principal", () => {
    const s = placeSummary({ ...base, rewardGoal: goal() });
    expect(s.primary).toBe("4 de 6 sellos");
    expect(s.secondary).toBe("Te faltan 2 para tu premio");
    expect(s.reward).toBeNull();
  });

  it("B · beneficio disponible sin tarjeta: solo el premio", () => {
    const s = placeSummary({ ...base, visitsTotal: 3, benefitAvailable: benefit });
    expect(s.primary).toBe("3 visitas");
    expect(s.reward).toBe("1 premio disponible");
    expect(s.secondary).toBeNull();
  });

  it("C · tarjeta Y premio: se muestran los dos, sin pisarse", () => {
    const s = placeSummary({
      ...base,
      rewardGoal: goal(),
      benefitAvailable: benefit,
    });
    expect(s.primary).toBe("4 de 6 sellos");
    expect(s.reward).toBe("1 premio disponible");
  });

  it("D · varias emisiones: se cuentan todas, no se deduplica por título", () => {
    const s = placeSummary({
      ...base,
      benefitAvailable: benefit,
      // Mismo título, códigos distintos = dos premios distintos.
      otherBenefits: [
        { title: "2x1", code: "BBB" },
        { title: "2x1", code: "CCC" },
      ],
    });
    expect(s.reward).toBe("3 premios disponibles");
  });

  it("E · sin ninguna mecánica NO se inventa un 0/N", () => {
    const s = placeSummary({ ...base, visitsTotal: 0 });
    expect(s.primary).toBe("Todavía no registraste visitas");
    expect(s.secondary).toBeNull();
    expect(s.reward).toBeNull();
    expect(s.primary).not.toMatch(/\d+ de \d+/);
  });

  it("E bis · con visitas pero sin mecánica, se dicen las visitas", () => {
    expect(placeSummary({ ...base, visitsTotal: 1 }).primary).toBe("1 visita");
    expect(placeSummary({ ...base, visitsTotal: 9 }).primary).toBe("9 visitas");
  });

  /*
    El detalle dibuja `LoyaltyCard` con `min(progress, target)`. Si el resumen
    contara distinto, el cliente vería "9 de 8 sellos" en la lista y "8/8" al
    entrar — el mismo dato diciendo dos cosas.
  */
  it("nunca muestra más sellos que el objetivo", () => {
    const s = placeSummary({
      ...base,
      rewardGoal: goal({ progressVisits: 9, targetAdditionalVisits: 8, remainingVisits: 0 }),
    });
    expect(s.primary).toBe("8 de 8 sellos");
    expect(s.secondary).toBeNull();
  });

  it("singular correcto cuando falta una sola visita", () => {
    const s = placeSummary({
      ...base,
      rewardGoal: goal({ progressVisits: 5, remainingVisits: 1 }),
    });
    expect(s.secondary).toBe("Te falta 1 para tu premio");
  });
});
