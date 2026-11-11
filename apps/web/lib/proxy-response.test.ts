import {
  buildProxyResponse,
  buildStreamingProxyResponse,
} from "./proxy-response";

describe("buildStreamingProxyResponse", () => {
  it("reenvía un event-stream sin bufferizar, chunk por chunk", async () => {
    const encoder = new TextEncoder();
    let push!: (chunk: string) => void;
    let close!: () => void;
    const upstream = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          push = (c) => controller.enqueue(encoder.encode(c));
          close = () => controller.close();
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
    );

    const res = buildStreamingProxyResponse(upstream)!;
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");

    const reader = res.body!.getReader();
    push("event: a\ndata: 1\n\n");
    const first = await reader.read();
    // El primer evento llega antes de que la API termine de responder.
    expect(new TextDecoder().decode(first.value)).toBe("event: a\ndata: 1\n\n");
    close();
    expect((await reader.read()).done).toBe(true);
  });

  it("no toca respuestas que no son streams", () => {
    const json = new Response("{}", { headers: { "Content-Type": "application/json" } });
    expect(buildStreamingProxyResponse(json)).toBeNull();
  });
});

const json = { "Content-Type": "application/json" };

describe("buildProxyResponse", () => {
  it("reenvía un 204 sin cuerpo en vez de romper con 500", async () => {
    const res = buildProxyResponse(204, new ArrayBuffer(0), json);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("reenvía cuerpo, estado y headers en el resto de los casos", async () => {
    const body = new TextEncoder().encode('{"ok":true}').buffer as ArrayBuffer;
    const res = buildProxyResponse(201, body, json);
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("también respeta errores con cuerpo", async () => {
    const body = new TextEncoder().encode('{"message":"x"}').buffer as ArrayBuffer;
    expect(buildProxyResponse(404, body, json).status).toBe(404);
  });
});
