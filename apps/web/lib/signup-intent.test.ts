import {
  buildClearSignupIntentCookie,
  buildSignupIntentCookie,
  parseSignupIntentFromSearchParams,
  readSignupIntentFromCookieHeader,
} from "./signup-intent";

/**
 * Intención de plan capturada en `/signup?plan=PRO&billing=...`. Lo que
 * importa: nunca activa Pro, cualquier valor fuera de los dos permitidos
 * se ignora, y la cookie se puede leer de vuelta exactamente como se
 * guardó.
 */
describe("parseSignupIntentFromSearchParams", () => {
  it("plan=PRO&billing=MONTHLY: intención mensual", () => {
    const params = new URLSearchParams("plan=PRO&billing=MONTHLY");
    expect(parseSignupIntentFromSearchParams(params)).toEqual({
      billing: "MONTHLY",
    });
  });

  it("plan=PRO&billing=YEARLY: intención anual", () => {
    const params = new URLSearchParams("plan=PRO&billing=YEARLY");
    expect(parseSignupIntentFromSearchParams(params)).toEqual({
      billing: "YEARLY",
    });
  });

  it("sin query params: signup normal, sin intención", () => {
    expect(parseSignupIntentFromSearchParams(new URLSearchParams(""))).toBeNull();
  });

  it("plan distinto de PRO: se ignora aunque billing sea válido", () => {
    const params = new URLSearchParams("plan=ENTERPRISE&billing=MONTHLY");
    expect(parseSignupIntentFromSearchParams(params)).toBeNull();
  });

  it("billing inválido: se ignora, nunca activa Pro con un valor desconocido", () => {
    for (const billing of ["monthly", "WEEKLY", "", "<script>"]) {
      const params = new URLSearchParams(`plan=PRO&billing=${billing}`);
      expect(parseSignupIntentFromSearchParams(params)).toBeNull();
    }
  });

  it("plan=PRO sin billing: se ignora — los dos params son obligatorios juntos", () => {
    expect(
      parseSignupIntentFromSearchParams(new URLSearchParams("plan=PRO")),
    ).toBeNull();
  });
});

describe("cookie: guardar y leer de vuelta", () => {
  it("lo que se guarda se puede leer de vuelta, mensual", () => {
    const cookie = buildSignupIntentCookie({ billing: "MONTHLY" });
    // `buildSignupIntentCookie` arma el string completo para `document.cookie`
    // (con Max-Age/Path/SameSite); `readSignupIntentFromCookieHeader` solo
    // necesita el par nombre=valor, como lo devolvería `document.cookie`.
    const header = cookie.split(";")[0];
    expect(readSignupIntentFromCookieHeader(header)).toEqual({
      billing: "MONTHLY",
    });
  });

  it("lo que se guarda se puede leer de vuelta, anual", () => {
    const cookie = buildSignupIntentCookie({ billing: "YEARLY" });
    expect(readSignupIntentFromCookieHeader(cookie.split(";")[0])).toEqual({
      billing: "YEARLY",
    });
  });

  it("convive con otras cookies del dominio, antes y después", () => {
    const header =
      "otra_cookie=valor; flikker_signup_intent=YEARLY; sesion=xyz";
    expect(readSignupIntentFromCookieHeader(header)).toEqual({
      billing: "YEARLY",
    });
  });

  it("sin la cookie presente: null, no un error", () => {
    expect(readSignupIntentFromCookieHeader("otra_cookie=valor")).toBeNull();
    expect(readSignupIntentFromCookieHeader("")).toBeNull();
  });

  it("valor corrupto en la cookie: se ignora, nunca se interpreta como Pro", () => {
    expect(
      readSignupIntentFromCookieHeader("flikker_signup_intent=cualquier_cosa"),
    ).toBeNull();
  });

  it("la cookie de borrado tiene Max-Age=0 — se invalida, no se deja vencer sola", () => {
    expect(buildClearSignupIntentCookie()).toContain("Max-Age=0");
  });

  it("la cookie no es httpOnly a propósito (el código la lee desde el cliente) y es SameSite=Lax", () => {
    const cookie = buildSignupIntentCookie({ billing: "MONTHLY" });
    expect(cookie.toLowerCase()).not.toContain("httponly");
    expect(cookie).toContain("SameSite=Lax");
  });
});
