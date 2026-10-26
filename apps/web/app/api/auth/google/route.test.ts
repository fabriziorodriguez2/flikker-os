const cookieSet = jest.fn();
jest.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}));

const apiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { GET } from "./route";

function start(query: string) {
  return GET(new Request(`https://flikker.site/api/auth/google?${query}`));
}

describe("GET /api/auth/google (inicio)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("pide la URL a la API con state/nonce/challenge y redirige a Google", async () => {
    apiFetch.mockResolvedValue({ url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" });

    const res = await start("from=login");

    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?x=1",
    );
    const body = apiFetch.mock.calls[0][2].body;
    expect(body.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // El verifier NUNCA sale del server hacia la API en este paso.
    expect(body).not.toHaveProperty("codeVerifier");
  });

  it("guarda el flujo (con la intención PRO) en una cookie httpOnly corta", async () => {
    apiFetch.mockResolvedValue({ url: "https://accounts.google.com/o/oauth2/v2/auth" });

    await start("from=signup&plan=PRO&billing=YEARLY");

    const [name, value, options] = cookieSet.mock.calls[0];
    expect(name).toBe("flikker_google_oauth");
    const flow = JSON.parse(value);
    expect(flow.pendingUpgradePlan).toBe("YEARLY");
    expect(flow.origin).toBe("signup");
    expect(flow.state).toBe(apiFetch.mock.calls[0][2].body.state);
    expect(options).toEqual(
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/api/auth/google",
        maxAge: 600,
      }),
    );
  });

  it("intención inválida o desde login: no se guarda", async () => {
    apiFetch.mockResolvedValue({ url: "https://accounts.google.com/o/oauth2/v2/auth" });
    await start("from=signup&plan=PRO&billing=WEEKLY");
    expect(JSON.parse(cookieSet.mock.calls[0][1]).pendingUpgradePlan).toBeNull();
  });

  it("API caída / Google no configurado → vuelve con el error genérico, sin cookie", async () => {
    apiFetch.mockRejectedValue(new Error("503"));

    const res = await start("from=signup&plan=PRO&billing=MONTHLY");

    expect(res.headers.get("Location")).toBe(
      "/signup?plan=PRO&billing=MONTHLY&error=google",
    );
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("nunca redirige a una URL que no sea de Google", async () => {
    apiFetch.mockResolvedValue({ url: "https://evil.example.com/" });
    const res = await start("from=login");
    expect(res.headers.get("Location")).toBe("/login?error=google");
  });
});
