import { resolveTrialState } from "./checkin-v2-subscription-client";

describe("estado visual de la suscripción CHECKIN_V2", () => {
  it("muestra trial activo solo mientras corresponde", () => {
    expect(resolveTrialState({ isPro: false, trialActive: true, benefitsBlocked: false })).toBe("active");
  });

  it("muestra trial vencido desde el bloqueo real de Benefits", () => {
    expect(resolveTrialState({ isPro: false, trialActive: false, benefitsBlocked: true })).toBe("expired");
  });

  it("Pro prevalece y nunca recibe mensajes de upgrade", () => {
    expect(resolveTrialState({ isPro: true, trialActive: false, benefitsBlocked: true })).toBe("pro");
  });

  it("no inventa un trial cuando aún no comenzó", () => {
    expect(resolveTrialState({ isPro: false, trialActive: false, benefitsBlocked: false })).toBe("none");
  });
});
