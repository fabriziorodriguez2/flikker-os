import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RouteProgressBar from "./route-progress-bar";

describe("RouteProgressBar", () => {
  it("es un status accesible, fijo arriba, sin alto ni ancho que empujen el layout", () => {
    const html = renderToStaticMarkup(<RouteProgressBar />);
    expect(html).toContain('role="status"');
    expect(html).toContain("fixed");
    expect(html).toContain("top-0");
    expect(html).toContain("h-[3px]");
  });

  it("el segmento que se desliza usa la clase compartida con la animación de globals.css", () => {
    const html = renderToStaticMarkup(<RouteProgressBar />);
    expect(html).toContain("route-progress-bar-fill");
  });

  it("es violeta Flikker, no un color arbitrario", () => {
    const html = renderToStaticMarkup(<RouteProgressBar />);
    expect(html).toContain("#5C6BC0");
  });
});
