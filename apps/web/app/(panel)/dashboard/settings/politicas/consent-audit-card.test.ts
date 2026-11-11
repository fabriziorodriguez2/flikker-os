import { consentAuditLines, type ConsentAuditView } from "./consent-audit-card";

const audit = (over: Partial<ConsentAuditView["whatsapp"]> = {}): ConsentAuditView => ({
  customers: { active: 105, withPhone: 98, withEmail: 20, linkedToMiFlikker: 10 },
  whatsapp: {
    granted: 12,
    grantedBySource: { CHECKIN_FORM: 10, MI_FLIKKER: 2 },
    revoked: 3,
    suppressed: 1,
    neverAsked: 82,
    neverAskedVisitedLast30d: 25,
    neverAskedWithMiFlikker: 4,
    noPhone: 7,
    ...over,
  },
  email: { granted: 2, revoked: 0, neverAsked: 18, noEmail: 85 },
  notes: [],
});

describe("consentAuditLines", () => {
  it("cuántos autorizaron y por dónde", () => {
    expect(consentAuditLines(audit()).headline).toBe(
      "12 de 105 clientes autorizaron recibir promociones por WhatsApp (10 en el check-in, 2 desde Mi Flikker).",
    );
  });

  it("por qué el resto no", () => {
    expect(consentAuditLines(audit()).reasons).toEqual([
      "82 todavía no respondieron.",
      "3 dijeron que no o se dieron de baja.",
      "1 pidieron no ser contactados.",
      "7 no tienen teléfono.",
    ]);
  });

  it("cómo sumar más, sin asumir autorizaciones", () => {
    const { next } = consentAuditLines(audit());
    expect(next[0]).toContain("25 de los que no respondieron vinieron en los últimos 30 días");
    expect(next[1]).toContain("opcional y viene desmarcada");
  });

  it("sin pendientes no sugiere nada", () => {
    expect(
      consentAuditLines(audit({ neverAsked: 0, neverAskedVisitedLast30d: 0 })).next,
    ).toEqual([]);
  });
});
