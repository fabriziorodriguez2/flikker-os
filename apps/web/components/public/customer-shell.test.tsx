import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CustomerShell from "./customer-shell";

/**
 * El invariante de identidad de Check-in V2.
 *
 * El problema que resuelve `CustomerShell` es que la experiencia se veía como
 * un producto distinto en cada local: el fondo salía del color del negocio, y
 * dos clientes en dos lugares distintos no sentían que estaban en la misma
 * app. Estos tests fijan la regla nueva — Flikker manda, el negocio queda
 * contenido — porque es exactamente lo que se rompe sin querer la próxima vez
 * que alguien quiera "que se vea más del local".
 */

const shell = (brand: string | null) =>
  renderToStaticMarkup(
    <CustomerShell business={{ name: "Local X", logoUrl: null }} brand={brand}>
      <p>contenido</p>
    </CustomerShell>,
  );

describe("CustomerShell — Flikker primero, negocio después", () => {
  it("dos negocios de colores opuestos comparten el MISMO marco", () => {
    const naranja = shell("#FF6B00");
    const bordo = shell("#5B0E2D");

    // Lo único que puede diferir entre un negocio y otro es la cuota --biz.
    const sinBiz = (html: string) =>
      html.replace(/--biz:[^;"]+/g, "").replace(/--biz-soft:[^;"]+/g, "");

    expect(sinBiz(naranja)).toEqual(sinBiz(bordo));
  });

  it("el fondo y las superficies nunca salen del color del negocio", () => {
    const html = shell("#FF6B00");
    expect(html).toContain("background-color:#F4F5FA");
    expect(html).toContain("--pub-bg:#F4F5FA");
    expect(html).toContain("--pub-surface:#FFFFFF");
    // El color del local no toca ningún token de superficie ni de texto.
    expect(html).not.toContain("--pub-bg:#FF6B00");
    expect(html).not.toContain("--pub-surface:#FF6B00");
    expect(html).not.toContain("background-color:#FF6B00");
  });

  it("el acento accionable es el de Flikker, no el del negocio", () => {
    const html = shell("#FF6B00");
    expect(html).toContain("--pub-accent:#5B5BD6");
    expect(html).not.toContain("--pub-accent:#FF6B00");
  });

  it("el negocio sí entra: como --biz y como nombre en el header", () => {
    const html = shell("#FF6B00");
    expect(html).toContain("--biz:#FF6B00");
    expect(html).toContain("Local X");
  });

  it("sin negocio no se dibuja header alguno (404, sesión vencida)", () => {
    const html = renderToStaticMarkup(
      <CustomerShell showWordmark>
        <p>contenido</p>
      </CustomerShell>,
    );
    expect(html).not.toContain("Local X");
    // Y sin marca de negocio, --biz cae al acento de Flikker, no a un color raro.
    expect(html).toContain("--biz:#5B5BD6");
  });

  it("el eyebrow no se inventa: solo aparece si la pantalla lo pasa", () => {
    expect(shell("#FF6B00")).not.toContain("Tu tarjeta en Flikker");
    const conEyebrow = renderToStaticMarkup(
      <CustomerShell
        business={{ name: "Local X", logoUrl: null }}
        eyebrow="Tu tarjeta en Flikker"
      >
        <p>contenido</p>
      </CustomerShell>,
    );
    expect(conEyebrow).toContain("Tu tarjeta en Flikker");
  });
});
