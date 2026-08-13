import { GET } from "./[...path]/route";

/**
 * El proxy reenvía TODO lo que devuelve la API, y por acá pasan dos cosas muy
 * distintas: JSON (todo el panel) y binario (el PNG del QR de un punto de
 * acceso).
 *
 * Hubo un bug real: el handler hacía `await res.text()`, que decodifica los
 * bytes como UTF-8. Para JSON da igual; para un PNG destruye el archivo — el
 * QR descargado dejaba de abrir. El fix del backend (`@Res()` + `res.send`)
 * estaba bien y el proxy lo volvía a romper después.
 *
 * Este test fija las dos mitades del contrato para que no vuelva a pasar.
 */

jest.mock("@/lib/auth", () => ({
  getSession: jest.fn().mockResolvedValue({
    accessToken: "token-1",
    refreshToken: "refresh-1",
    activeBusinessId: "biz-1",
    user: { id: "u1" },
    memberships: [],
  }),
  setSession: jest.fn(),
  clearSession: jest.fn(),
}));

/** Firma PNG real: 89 50 4E 47 0D 0A 1A 0A. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Un byte >0x7F que NO es UTF-8 válido: es exactamente lo que `res.text()`
// reemplazaría por U+FFFD.
const PNG_BYTES = Uint8Array.from([...PNG_SIGNATURE, 0xff, 0xd8, 0x00, 0x42]);

function makeRequest(path: string) {
  return new Request(`http://localhost:3001/api/proxy/${path}`);
}

function makeParams(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("proxy — respuestas JSON", () => {
  it("llega idéntica: mismo body, mismo status, mismo content-type", async () => {
    const payload = { data: [{ id: "s1", name: "Principal" }], total: 1 };
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await GET(
      makeRequest("visit-sources"),
      makeParams(["visit-sources"]),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual(payload);
  });

  it("propaga el status de error y su cuerpo JSON", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "No encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await GET(
      makeRequest("visit-sources/nope"),
      makeParams(["visit-sources", "nope"]),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: "No encontrado" });
  });
});

describe("proxy — respuestas binarias", () => {
  it("conserva los bytes del PNG sin corromperlos", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(PNG_BYTES, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": 'attachment; filename="checkin-qr.png"',
        },
      }),
    );

    const res = await GET(
      makeRequest("visit-sources/s1/qr"),
      makeParams(["visit-sources", "s1", "qr"]),
    );

    const bytes = new Uint8Array(await res.arrayBuffer());

    // Byte a byte: con `res.text()` el 0xFF suelto se convertía en U+FFFD y
    // el archivo crecía/cambiaba. Acá tiene que salir exactamente lo que entró.
    expect(Array.from(bytes)).toEqual(Array.from(PNG_BYTES));
    expect(Array.from(bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
  });

  it("conserva content-type y content-disposition", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(PNG_BYTES, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": 'attachment; filename="checkin-qr.png"',
        },
      }),
    );

    const res = await GET(
      makeRequest("visit-sources/s1/qr"),
      makeParams(["visit-sources", "s1", "qr"]),
    );

    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="checkin-qr.png"',
    );
  });
});
