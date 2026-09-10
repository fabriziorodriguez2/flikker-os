import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CheckinClient from "./checkin-client";
import type { CheckinLanding } from "./page";

const landing: CheckinLanding = {
  source: { name: "Principal", type: "qr" },
  business: {
    businessName: "Café Uno",
    logoUrl: null,
    primaryColor: "#5C6BC0",
    checkinBackgroundColor: "#8A746B",
    googleBusinessProfileUrl: "https://g.page/cafe",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  benefit: null,
  benefitText: null,
  welcomeMessage: null,
};

function render(hasSession: boolean) {
  return renderToStaticMarkup(
    <CheckinClient token="tok-1" landing={landing} hasSession={hasSession} />,
  );
}

describe("CheckinClient initial render", () => {
  it("shows the first-visit form when there is no session", () => {
    const html = render(false);
    expect(html).toContain("Tu nombre");
    expect(html).toContain("Registrar mi visita");
    // Recovery is offered without exposing anything private.
    expect(html).toContain("Ya soy cliente");
  });

  it("does not leak a Google review link on the first-visit form", () => {
    const html = render(false);
    const googleLinks = Array.from(html.matchAll(/href="([^"]+)"/g))
      .map((m) => m[1])
      .filter((h) => h.includes("google") || h.includes("g.page"));
    expect(googleLinks).toHaveLength(0);
  });

  /*
    Este guard antes fijaba lo contrario: que el fondo de la pantalla fuera
    `checkinBackgroundColor` del negocio. El criterio cambió — Flikker es la
    identidad principal y el negocio la secundaria — así que ahora fija que el
    color del local NO pinte la superficie, y que el marco sea el mismo en
    todos los negocios. Es el invariante que evita que la app vuelva a verse
    como una mini landing distinta por local.
  */
  it("no pinta la pantalla con el color del negocio: el fondo es el de Flikker", () => {
    const html = render(false);
    expect(html).toContain("background-color:#F4F5FA");
    expect(html).not.toContain("background-color:#8A746B");
  });

  /*
    `checkinBackgroundColor` es el campo que el dueño configura en Programa →
    Página de inscripción y que ANTES pintaba la pantalla entera. Ya no pinta
    nada: no tiene que aparecer en el HTML ni siquiera como acento. La
    identidad del local entra por su color de marca (`primaryColor`).
  */
  it("el fondo configurado por el negocio ya no llega a la pantalla", () => {
    const html = render(false);
    expect(html).not.toContain("8A746B");
  });

  it("el acento accionable es el de Flikker, no el del negocio", () => {
    const html = render(false);
    expect(html).toContain("--pub-accent:#5B5BD6");
  });

  it("el negocio se identifica por nombre en el header, no por el fondo", () => {
    const html = render(false);
    expect(html).toContain("Café Uno");
  });
});
