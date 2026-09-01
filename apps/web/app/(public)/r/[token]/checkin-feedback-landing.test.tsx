import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CheckinFeedbackLanding from "./checkin-feedback-landing";

const GOOGLE_URL = "https://g.page/r/example/review";

const source = readFileSync(
  join(__dirname, "checkin-feedback-landing.tsx"),
  "utf8",
);
const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");

function googleLinks(html: string) {
  return Array.from(html.matchAll(/href="([^"]+)"/g))
    .map((match) => match[1])
    .filter((href) => href.includes("google.com") || href.includes("g.page"));
}

describe("CheckinFeedbackLanding", () => {
  // Tests 5 y 6 del pedido, del lado del cliente: el componente no tiene
  // NINGUNA rama por puntaje, así que 1 estrella y 5 estrellas recorren el
  // mismo camino por construcción.
  it("no ramifica por puntaje en ningún lado", () => {
    expect(source).not.toMatch(/score\s*[><]=?\s*\d/);
    expect(source).not.toMatch(/score\s*===\s*[45]/);
  });

  // Test 8 del pedido: sin Google conectado no se renderiza ningún enlace.
  it("no ofrece ningún enlace cuando el negocio no tiene Google", () => {
    const html = renderToStaticMarkup(
      <CheckinFeedbackLanding
        token="token-1"
        businessName="Bar Fraternidad"
        googleReviewUrl={null}
        alreadySubmitted
      />,
    );
    expect(googleLinks(html)).toHaveLength(0);
    // Y la pantalla sigue siendo útil: agradece igual.
    expect(html).toContain("Gracias por contarnos");
  });

  it("ofrece exactamente un enlace a Google cuando está conectado", () => {
    const html = renderToStaticMarkup(
      <CheckinFeedbackLanding
        token="token-1"
        businessName="Bar Fraternidad"
        googleReviewUrl={GOOGLE_URL}
        alreadySubmitted
      />,
    );
    expect(googleLinks(html)).toEqual([GOOGLE_URL]);
    expect(html).toContain("Compartir tambi");
  });

  it("deja claro que Google es opcional y no afecta la recompensa", () => {
    const html = renderToStaticMarkup(
      <CheckinFeedbackLanding
        token="token-1"
        businessName="Bar Fraternidad"
        googleReviewUrl={GOOGLE_URL}
        alreadySubmitted
      />,
    );
    expect(html).toMatch(/no cambia tus sellos/i);
  });

  it("usa la ruta pública por token, nunca el customerId", () => {
    expect(source).toContain("/api/feedback/${encodeURIComponent(token)}");
    expect(source).not.toMatch(/customerId/);
  });
});

describe("routing compartido de /r/[token]", () => {
  // Test 3 del pedido, del lado del routing: Check-in V2 nunca cae en el
  // landing LEGACY (el que tiene el gating por puntaje).
  it("manda CHECKIN_V2 al landing nuevo y LEGACY al viejo", () => {
    expect(pageSource).toMatch(
      /experienceVersion\s*===\s*"CHECKIN_V2"[\s\S]*?<CheckinFeedbackLanding/,
    );
    expect(pageSource).toMatch(/<FeedbackLanding/);
  });
});
