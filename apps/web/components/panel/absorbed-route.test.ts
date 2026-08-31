import { isCheckinV2Business, isCheckinV2Experience } from "./absorbed-route";
import { apiFetch } from "@/lib/api";
import type { Session } from "@/lib/auth";

jest.mock("@/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    accessToken: "token-owner",
    refreshToken: "refresh",
    user: { id: "u1", email: "owner@test.com", firstName: "O", lastName: "W" },
    memberships: [],
    activeBusinessId: "biz-1",
    impersonation: null,
    ...overrides,
  };
}

/**
 * Bug real corregido — auditoría de caso real (Bar Fraternidad): un Platform
 * Admin impersonando un negocio Check-in V2 real veía Insights LEGACY en vez
 * del Insights que ve el dueño. `isCheckinV2Business` sigue existiendo para
 * las rutas absorbidas (Retention V2, Check-ins técnicos) que SÍ necesitan
 * que impersonation seas vea la herramienta interna cruda — la distinción
 * entre las dos funciones es exactamente lo que este archivo prueba.
 */
describe("isCheckinV2Experience vs isCheckinV2Business — la distinción de impersonation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("isCheckinV2Experience: true para un dueño real de un negocio CHECKIN_V2", async () => {
    mockedApiFetch.mockResolvedValue({ experienceVersion: "CHECKIN_V2" });
    const result = await isCheckinV2Experience(makeSession());
    expect(result).toBe(true);
  });

  it("isCheckinV2Experience: true para un Platform Admin IMPERSONANDO un negocio CHECKIN_V2 (el fix)", async () => {
    mockedApiFetch.mockResolvedValue({ experienceVersion: "CHECKIN_V2" });
    const session = makeSession({
      impersonation: {
        accessToken: "token-impersonation",
        businessId: "biz-impersonated",
        businessName: "Bar Fraternidad",
        businessSlug: "bar-fraternidad",
        startedAt: new Date().toISOString(),
      },
    });
    const result = await isCheckinV2Experience(session);
    expect(result).toBe(true);
  });

  /**
   * Bug real que el test anterior NO atrapaba: con `apiFetch` mockeado para
   * resolver siempre, daba `true` igual aunque la llamada usara el token del
   * ADMIN. En producción eso es un 403 de `TenantGuard` (el admin no tiene
   * Membership en el negocio de su cliente) → `catch` → `false` → Insights
   * LEGACY. Por eso acá se afirma CON QUÉ credenciales se llama, no solo el
   * booleano que vuelve.
   */
  it("isCheckinV2Experience: impersonando, pregunta con el token DE IMPERSONATION y el negocio impersonado — nunca con el del admin", async () => {
    mockedApiFetch.mockResolvedValue({ experienceVersion: "CHECKIN_V2" });
    const session = makeSession({
      accessToken: "token-admin",
      activeBusinessId: "biz-impersonated",
      impersonation: {
        accessToken: "token-impersonation",
        businessId: "biz-impersonated",
        businessName: "Bar Fraternidad",
        businessSlug: "bar-fraternidad",
        startedAt: new Date().toISOString(),
      },
    });

    await isCheckinV2Experience(session);

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/businesses/current",
      "token-impersonation",
      { businessId: "biz-impersonated" },
    );
  });

  it("isCheckinV2Experience: sin impersonation, sigue preguntando con el token y el negocio del dueño", async () => {
    mockedApiFetch.mockResolvedValue({ experienceVersion: "CHECKIN_V2" });

    await isCheckinV2Experience(
      makeSession({ accessToken: "token-owner", activeBusinessId: "biz-1" }),
    );

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/businesses/current",
      "token-owner",
      { businessId: "biz-1" },
    );
  });

  it("isCheckinV2Experience: false para un negocio LEGACY, con o sin impersonation", async () => {
    mockedApiFetch.mockResolvedValue({ experienceVersion: "LEGACY" });
    expect(await isCheckinV2Experience(makeSession())).toBe(false);
    expect(
      await isCheckinV2Experience(
        makeSession({
          impersonation: {
            accessToken: "t",
            businessId: "b",
            businessName: "n",
            businessSlug: "s",
            startedAt: new Date().toISOString(),
          },
        }),
      ),
    ).toBe(false);
  });

  it("isCheckinV2Business: sigue devolviendo false bajo impersonation aunque el negocio sea CHECKIN_V2 (rutas absorbidas — sin cambios)", async () => {
    mockedApiFetch.mockResolvedValue({ experienceVersion: "CHECKIN_V2" });
    const session = makeSession({
      impersonation: {
        accessToken: "token-admin",
        businessId: "biz-impersonated",
        businessName: "Bar Fraternidad",
        businessSlug: "bar-fraternidad",
        startedAt: new Date().toISOString(),
      },
    });
    const result = await isCheckinV2Business(session);
    expect(result).toBe(false);
    // Ni siquiera llega a preguntarle al backend — corta antes.
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("isCheckinV2Business: true para un dueño real (sin impersonation) de un negocio CHECKIN_V2", async () => {
    mockedApiFetch.mockResolvedValue({ experienceVersion: "CHECKIN_V2" });
    const result = await isCheckinV2Business(makeSession());
    expect(result).toBe(true);
  });

  it("ambas: false sin sesión", async () => {
    expect(await isCheckinV2Experience(null)).toBe(false);
    expect(await isCheckinV2Business(null)).toBe(false);
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("isCheckinV2Experience: false si el fetch de negocio falla (sin dato confiable)", async () => {
    mockedApiFetch.mockRejectedValue(new Error("network down"));
    const result = await isCheckinV2Experience(makeSession());
    expect(result).toBe(false);
  });
});
