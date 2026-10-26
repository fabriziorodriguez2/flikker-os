import { readFileSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthDivider, GoogleAuthButton } from "./google-auth-button";

describe("GoogleAuthButton", () => {
  const html = renderToStaticMarkup(
    <GoogleAuthButton href="/api/auth/google?from=login" />,
  );

  it("es un link real (navegación completa) con el copy estándar", () => {
    expect(html).toMatch(/^<a [^>]*href="\/api\/auth\/google\?from=login"/);
    expect(html).toContain("Continuar con Google");
  });

  it("fondo blanco, borde neutro, nada violeta; G oficial decorativa", () => {
    expect(html).toContain("bg-white");
    expect(html).not.toContain("#5B43E8");
    expect(html).toContain('aria-hidden="true"');
    for (const color of ["#EA4335", "#4285F4", "#FBBC05", "#34A853"]) {
      expect(html).toContain(color);
    }
  });

  it("separador accesible con 'o'", () => {
    const divider = renderToStaticMarkup(<AuthDivider />);
    expect(divider).toContain('role="separator"');
    expect(divider).toContain(">o<");
  });
});

/**
 * Guarda de cableado (mismo criterio que `layout-nav-wiring.test.ts`): no hay
 * RTL en este repo para montar las páginas con `useSearchParams`.
 */
describe("login/signup — cableado de Continuar con Google", () => {
  const authDir = join(__dirname, "../../app/(auth)");
  const login = readFileSync(join(authDir, "login/page.tsx"), "utf-8");
  const signup = readFileSync(join(authDir, "signup/page.tsx"), "utf-8");

  it("login muestra el botón Google ANTES del form tradicional, que sigue igual", () => {
    expect(login).toMatch(/<GoogleAuthButton[\s\S]*origin: "login"/);
    expect(login.indexOf("<GoogleAuthButton")).toBeLessThan(
      login.indexOf("<form"),
    );
    expect(login).toContain('fetch("/api/auth/login"');
  });

  it("signup muestra el botón Google arriba y le pasa la intención PRO", () => {
    expect(signup).toMatch(
      /buildGoogleStartHref\(\{ origin: "signup", pendingUpgradePlan \}\)/,
    );
    expect(signup.indexOf("<GoogleAuthButton")).toBeLessThan(
      signup.indexOf("<form"),
    );
    expect(signup).toContain('fetch("/api/auth/signup"');
  });

  it("ambos muestran el copy genérico cuando vuelven con ?error=google", () => {
    for (const source of [login, signup]) {
      expect(source).toMatch(
        /searchParams\.get\("error"\) === "google" \? GOOGLE_AUTH_ERROR_MESSAGE/,
      );
    }
  });
});
