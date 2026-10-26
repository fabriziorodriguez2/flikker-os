import {
  buildGoogleErrorPath,
  buildGoogleStartHref,
  parseGoogleOAuthFlow,
  resolvePostGoogleRedirect,
} from "./google-oauth";
import { createGoogleOAuthFlow, googleStatesMatch } from "./google-oauth-server";
import { createHash } from "crypto";

const TOKEN = "a".repeat(43);

describe("buildGoogleStartHref", () => {
  it("login: solo origen", () => {
    expect(buildGoogleStartHref({ origin: "login" })).toBe(
      "/api/auth/google?from=login",
    );
  });

  it.each(["MONTHLY", "YEARLY"] as const)(
    "signup con intención PRO %s: la preserva hacia nuestro server",
    (plan) => {
      const href = buildGoogleStartHref({ origin: "signup", pendingUpgradePlan: plan });
      const params = new URL(href, "https://x.test").searchParams;
      expect(params.get("from")).toBe("signup");
      expect(params.get("plan")).toBe("PRO");
      expect(params.get("billing")).toBe(plan);
    },
  );

  it("descarta un next externo (open redirect)", () => {
    expect(
      buildGoogleStartHref({ origin: "login", next: "//evil.com" }),
    ).toBe("/api/auth/google?from=login");
    expect(
      buildGoogleStartHref({ origin: "login", next: "/redeem/abc" }),
    ).toContain("next=%2Fredeem%2Fabc");
  });
});

describe("resolvePostGoogleRedirect — estado REAL del User", () => {
  it("A: con Business → dashboard (aunque viniera con intención PRO)", () => {
    expect(
      resolvePostGoogleRedirect({
        membershipsCount: 1,
        pendingUpgradePlan: "MONTHLY",
        next: null,
      }),
    ).toBe("/dashboard");
  });

  it("A: con Business y next seguro → next", () => {
    expect(
      resolvePostGoogleRedirect({
        membershipsCount: 2,
        pendingUpgradePlan: null,
        next: "/redeem/tok",
      }),
    ).toBe("/redeem/tok");
  });

  it("B: sin Business + PRO → /upgrade", () => {
    expect(
      resolvePostGoogleRedirect({
        membershipsCount: 0,
        pendingUpgradePlan: "YEARLY",
        next: null,
      }),
    ).toBe("/upgrade");
  });

  it("C: sin Business, sin intención → /comenzar", () => {
    expect(
      resolvePostGoogleRedirect({
        membershipsCount: 0,
        pendingUpgradePlan: null,
        next: "/redeem/tok",
      }),
    ).toBe("/comenzar");
  });

  it("platform admin → /platform (igual que el login con password)", () => {
    expect(
      resolvePostGoogleRedirect({
        isPlatformAdmin: true,
        membershipsCount: 0,
        pendingUpgradePlan: null,
        next: null,
      }),
    ).toBe("/platform");
  });
});

describe("buildGoogleErrorPath", () => {
  it("login (o flujo vencido) → /login?error=google", () => {
    expect(buildGoogleErrorPath(null)).toBe("/login?error=google");
    expect(
      buildGoogleErrorPath({ origin: "login", pendingUpgradePlan: null }),
    ).toBe("/login?error=google");
  });

  it("signup con PRO → vuelve a signup SIN perder la intención", () => {
    expect(
      buildGoogleErrorPath({ origin: "signup", pendingUpgradePlan: "YEARLY" }),
    ).toBe("/signup?plan=PRO&billing=YEARLY&error=google");
  });
});

describe("parseGoogleOAuthFlow", () => {
  const valid = {
    state: TOKEN,
    nonce: TOKEN,
    codeVerifier: TOKEN,
    pendingUpgradePlan: "MONTHLY",
    next: "/redeem/x",
    origin: "signup",
  };

  it("acepta la cookie que escribe el start", () => {
    expect(parseGoogleOAuthFlow(JSON.stringify(valid))).toEqual(valid);
  });

  it("rechaza ausente, basura o tokens malformados (callback vencido/manipulado)", () => {
    expect(parseGoogleOAuthFlow(undefined)).toBeNull();
    expect(parseGoogleOAuthFlow("no-json")).toBeNull();
    expect(
      parseGoogleOAuthFlow(JSON.stringify({ ...valid, state: "corto" })),
    ).toBeNull();
  });

  it("sanea plan y next manipulados en vez de confiar en ellos", () => {
    const flow = parseGoogleOAuthFlow(
      JSON.stringify({ ...valid, pendingUpgradePlan: "FREE_FOREVER", next: "https://evil.com" }),
    );
    expect(flow?.pendingUpgradePlan).toBeNull();
    expect(flow?.next).toBeNull();
  });
});

describe("google-oauth-server", () => {
  it("genera state/nonce/verifier aleatorios de 43 chars y challenge S256", () => {
    const a = createGoogleOAuthFlow({ origin: "login", pendingUpgradePlan: null, next: null });
    const b = createGoogleOAuthFlow({ origin: "login", pendingUpgradePlan: null, next: null });

    expect(a.flow.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.flow.state).not.toBe(b.flow.state);
    expect(a.flow.nonce).not.toBe(a.flow.state);
    expect(a.codeChallenge).toBe(
      createHash("sha256").update(a.flow.codeVerifier).digest("base64url"),
    );
    // El flujo serializado es exactamente lo que el callback sabe leer.
    expect(parseGoogleOAuthFlow(JSON.stringify(a.flow))).toEqual(a.flow);
  });

  it("googleStatesMatch: solo el state exacto", () => {
    expect(googleStatesMatch(TOKEN, TOKEN)).toBe(true);
    expect(googleStatesMatch(TOKEN, "b".repeat(43))).toBe(false);
    expect(googleStatesMatch(TOKEN, TOKEN.slice(1))).toBe(false);
    expect(googleStatesMatch(TOKEN, null)).toBe(false);
  });
});
