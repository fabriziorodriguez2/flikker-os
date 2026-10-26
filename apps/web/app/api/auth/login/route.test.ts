const apiFetch = jest.fn();
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

const setSession = jest.fn();
jest.mock("@/lib/auth", () => ({
  setSession: (...args: unknown[]) => setSession(...args),
}));

import { ApiError } from "@/lib/api";
import { POST } from "./route";

function login() {
  return POST(
    new Request("https://flikker.site/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", password: "password1" }),
    }),
  );
}

describe("POST /api/auth/login", () => {
  beforeEach(() => jest.clearAllMocks());

  it("login tradicional sigue igual: sesión + /dashboard", async () => {
    apiFetch.mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
      user: { id: "u", email: "a@b.com", firstName: "A", lastName: "B" },
      memberships: [{ businessId: "biz", role: "OWNER", business: { name: "N", slug: "n" } }],
    });

    const res = await login();

    expect(await res.json()).toEqual({ ok: true, redirectTo: "/dashboard" });
    expect(setSession).toHaveBeenCalledWith(
      expect.objectContaining({ activeBusinessId: "biz" }),
    );
  });

  it("credenciales inválidas: mismo copy de siempre", async () => {
    apiFetch.mockRejectedValue(new ApiError(401, "Invalid credentials"));
    const res = await login();
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe("Email o contraseña incorrectos");
  });

  it("cuenta solo-Google: explica que use Google o cree una contraseña", async () => {
    apiFetch.mockRejectedValue(
      new ApiError(401, "Esta cuenta usa Google para iniciar sesión."),
    );
    const res = await login();
    expect(res.status).toBe(401);
    expect((await res.json()).message).toContain("Continuar con Google");
    expect(setSession).not.toHaveBeenCalled();
  });
});
