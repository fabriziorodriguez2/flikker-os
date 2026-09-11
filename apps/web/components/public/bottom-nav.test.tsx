import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BottomNav, { type MiFlikkerTab } from "./bottom-nav";

/**
 * La barra de navegación de Mi Flikker.
 *
 * Lo que estos tests protegen: que la pestaña activa se marque de forma
 * inequívoca (no solo por color, que no es accesible por sí solo), que cada
 * pestaña sea una URL — porque la barra también vive en el detalle de un
 * lugar, que es otra ruta — y que el badge cuente SOLO disponibles.
 */
const render = (active: MiFlikkerTab, rewardsBadge?: number) =>
  renderToStaticMarkup(
    <BottomNav active={active} rewardsBadge={rewardsBadge} />,
  );

const tabOf = (html: string, tab: string) =>
  html.match(new RegExp(`<a[^>]*data-tab="${tab}"[^>]*>`))?.[0] ?? "";

describe("BottomNav — navegación activa", () => {
  it("tiene exactamente las cuatro pestañas del producto", () => {
    const html = render("lugares");
    for (const tab of ["lugares", "desafios", "premios", "cuenta"]) {
      expect(tabOf(html, tab)).not.toBe("");
    }
    expect(html.match(/data-tab=/g)).toHaveLength(4);
  });

  it.each(["lugares", "desafios", "premios", "cuenta"] as MiFlikkerTab[])(
    "marca %s como activa, y solo a esa",
    (active) => {
      const html = render(active);

      expect(tabOf(html, active)).toContain('data-active="true"');
      // `aria-current` para que no dependa solo del color.
      expect(tabOf(html, active)).toContain('aria-current="page"');
      expect(html.match(/data-active="true"/g)).toHaveLength(1);
    },
  );

  it("cada pestaña es una URL — la barra funciona desde cualquier pantalla", () => {
    const html = render("lugares");

    expect(tabOf(html, "lugares")).toContain('href="/mi-flikker"');
    expect(tabOf(html, "desafios")).toContain('href="/mi-flikker?tab=desafios"');
    expect(tabOf(html, "premios")).toContain('href="/mi-flikker?tab=premios"');
    expect(tabOf(html, "cuenta")).toContain('href="/mi-flikker?tab=cuenta"');
  });

  it("respeta el safe-area de iPhone", () => {
    expect(render("lugares")).toContain("pb-[env(safe-area-inset-bottom)]");
  });
});

describe("BottomNav — badge de premios", () => {
  it("muestra la cantidad de disponibles sobre Premios", () => {
    const html = render("lugares", 2);
    expect(html).toContain(">2<");
  });

  it("sin premios disponibles no dibuja ningún badge", () => {
    const html = render("lugares", 0);
    // El único texto de esa pestaña es su etiqueta.
    expect(html).not.toMatch(/>0</);
  });

  it("por default (sin prop) tampoco dibuja badge", () => {
    expect(render("lugares")).not.toMatch(/>\d+</);
  });
});
