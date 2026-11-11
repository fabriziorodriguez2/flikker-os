import { ApiError } from "@/lib/api";

const cookieJar = new Map<string, string>();
const cookieSet = jest.fn((name: string, value: string) => {
  cookieJar.set(name, value);
});

jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: cookieSet,
  }),
}));

const apiFetch = jest.fn();
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

const setSession = jest.fn();
jest.mock("@/lib/auth", () => ({
  setSession: (...args: unknown[]) => setSession(...args),
}));

import { GET } from "./route";

const STATE = "s".repeat(43);
const FLOW = {
  state: STATE,
  nonce: "n".repeat(43),
  codeVerifier: "v".repeat(43),
  pendingUpgradePlan: null as "MONTHLY" | "YEARLY" | null,
  next: null,
  origin: "login" as "login" | "signup",
};

function apiResponse(overrides: {
  memberships?: unknown[];
  pendingUpgradePlan?: "MONTHLY" | "YEARLY" | null;
} = {}) {
  return {
    accessToken: "access",
    refreshToken: "refresh",
    user: {
      id: "user-1",
      email: "mateo@gmail.com",
      firstName: "Mateo",
      lastName: "Gómez",
      isPlatformAdmin: false,
      pendingUpgradePlan: overrides.pendingUpgradePlan ?? null,
    },
    memberships: overrides.memberships ?? [],
  };
}

function callback(query: string) {
  return GET(new Request(`https://flikker.site/api/auth/google/callback?${query}`));
}

describe("GET /api/auth/google/callback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cookieJar.clear();
  });

  function withFlow(flow = FLOW) {
    cookieJar.set("flikker_google_oauth", JSON.stringify(flow));
  }

  it("state incorrecto → rechazado sin llamar a la API ni crear sesión", async () => {
    withFlow();
    const res = await callback(`code=abc&state=${"x".repeat(43)}`);

    expect(res.headers.get("Location")).toBe("/login?error=google");
    expect(apiFetch).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("sin cookie (callback vencido o de otro navegador) → error genérico", async () => {
    const res = await callback(`code=abc&state=${STATE}`);
    expect(res.headers.get("Location")).toBe("/login?error=google");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("usuario cancela en Google (error=access_denied) → error genérico", async () => {
    withFlow();
    const res = await callback(`error=access_denied&state=${STATE}`);
    expect(res.headers.get("Location")).toBe("/login?error=google");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("la cookie del flujo se consume siempre (un solo uso)", async () => {
    withFlow();
    await callback(`code=abc&state=${"x".repeat(43)}`);
    expect(cookieSet).toHaveBeenCalledWith(
      "flikker_google_oauth",
      "",
      expect.objectContaining({ maxAge: 0, path: "/api/auth/google" }),
    );
  });

  it("OK: manda verifier/nonce DE LA COOKIE, escribe la sesión Flikker normal y va a /comenzar", async () => {
    withFlow();
    apiFetch.mockResolvedValue(apiResponse());

    const res = await callback(`code=the-code&state=${STATE}`);

    expect(apiFetch).toHaveBeenCalledWith("/auth/google/callback", null, {
      method: "POST",
      body: { code: "the-code", codeVerifier: FLOW.codeVerifier, nonce: FLOW.nonce },
    });
    expect(setSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access",
        refreshToken: "refresh",
        memberships: [],
        activeBusinessId: null,
      }),
    );
    expect(res.headers.get("Location")).toBe("/comenzar");
  });

  it("intención PRO viaja desde la cookie (no del query) y termina en /upgrade", async () => {
    withFlow({ ...FLOW, origin: "signup", pendingUpgradePlan: "YEARLY" });
    apiFetch.mockResolvedValue(apiResponse({ pendingUpgradePlan: "YEARLY" }));

    const res = await callback(`code=c&state=${STATE}&plan=PRO&billing=MONTHLY`);

    expect(apiFetch.mock.calls[0][2].body.pendingUpgradePlan).toBe("YEARLY");
    expect(res.headers.get("Location")).toBe("/upgrade");
  });

  it("User con Business → /dashboard con el negocio activo", async () => {
    withFlow({ ...FLOW, origin: "signup", pendingUpgradePlan: "MONTHLY" });
    apiFetch.mockResolvedValue(
      apiResponse({
        memberships: [
          { businessId: "biz-1", role: "OWNER", business: { name: "Café", slug: "cafe", logoUrl: "https://long" } },
        ],
      }),
    );

    const res = await callback(`code=c&state=${STATE}`);

    expect(res.headers.get("Location")).toBe("/dashboard");
    const session = setSession.mock.calls[0][0];
    expect(session.activeBusinessId).toBe("biz-1");
    expect(session.memberships[0].business).toEqual({ name: "Café", slug: "cafe" });
  });

  it("API rechaza (code/token inválido, email no verificado) → copy genérico, conservando la intención en signup", async () => {
    withFlow({ ...FLOW, origin: "signup", pendingUpgradePlan: "MONTHLY" });
    apiFetch.mockRejectedValue(new ApiError(401, "No pudimos iniciar sesión con Google. Probá de nuevo."));

    const res = await callback(`code=c&state=${STATE}`);

    expect(res.headers.get("Location")).toBe(
      "/signup?plan=PRO&billing=MONTHLY&error=google",
    );
    expect(setSession).not.toHaveBeenCalled();
  });
});
