import { consentLine, type ConsentPreview } from "./promotions-tab";

const consent = (over: Partial<ConsentPreview> = {}): ConsentPreview => ({
  audience: 10,
  whatsappEligible: 4,
  whatsappExcludedNoConsent: 6,
  emailEligible: 0,
  emailExcludedNoConsent: 0,
  ...over,
});

describe("consentLine", () => {
  it("dice a cuántos les llega y cuántos quedan afuera por no autorizar", () => {
    expect(consentLine(consent())).toBe(
      "4 de 10 clientes autorizaron WhatsApp. 6 clientes quedan afuera porque no autorizaron promociones.",
    );
  });

  it("sin excluidos no menciona exclusiones", () => {
    expect(
      consentLine(consent({ whatsappEligible: 10, whatsappExcludedNoConsent: 0 })),
    ).toBe("10 de 10 clientes autorizaron WhatsApp.");
  });

  it("si nadie autorizó lo explica y dice cuándo se les pregunta", () => {
    expect(
      consentLine(consent({ whatsappEligible: 0, whatsappExcludedNoConsent: 10 })),
    ).toContain("Ninguno de los 10 clientes autorizó");
  });

  it("audiencia vacía", () => {
    expect(
      consentLine(consent({ audience: 0, whatsappEligible: 0, whatsappExcludedNoConsent: 0 })),
    ).toBe("No hay clientes en esta audiencia.");
  });
});
