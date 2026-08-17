import { shouldRedirectToLogin } from "./session-expiry-handler";

/**
 * Regla única y completa: 401 real de sesión inválida es lo ÚNICO que puede
 * mandar a /login desde el cliente. 403 (tenant/rol equivocado) y 500 (error
 * real del servidor) nunca deben terminar ahí — confundirlos fue la mitad de
 * un bug real donde un negocio LEGACY quedaba efectivamente bloqueado del
 * panel (ver `customers-legacy-access.e2e-spec.ts` para la otra mitad, la
 * causa real en `onboarding.service.ts`).
 */
describe("shouldRedirectToLogin", () => {
  it("401 → true (sesión inválida real)", () => {
    expect(shouldRedirectToLogin(401)).toBe(true);
  });

  it.each([403, 500, 502, 503])(
    "%i → false (nunca manda a /login)",
    (status) => {
      expect(shouldRedirectToLogin(status)).toBe(false);
    },
  );

  it.each([200, 201, 204, 400, 404])(
    "%i → false (no es un caso de sesión)",
    (status) => {
      expect(shouldRedirectToLogin(status)).toBe(false);
    },
  );
});
