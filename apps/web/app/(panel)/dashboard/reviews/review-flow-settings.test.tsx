import { renderToStaticMarkup } from "react-dom/server";
import ReviewFlowSettings from "./review-flow-settings";

/**
 * `renderToStaticMarkup` no ejecuta `onClick` (no hay DOM/jsdom en este
 * repo) — lo que se prueba acá es la forma inicial: las dos opciones
 * siempre visibles con su copy real, cuál queda marcada, y que DIRECT_GOOGLE
 * se deshabilite sin un destino de Google real (Parte 6, nunca gating por
 * puntaje — esto es, directamente, la elección por negocio).
 */
const render = (
  props: Partial<Parameters<typeof ReviewFlowSettings>[0]> = {},
) =>
  renderToStaticMarkup(
    <ReviewFlowSettings
      businessId="biz-1"
      mode="PRIVATE_FEEDBACK"
      hasGoogleReviewUrl={true}
      canManage={true}
      onSaved={() => {}}
      {...props}
    />,
  );

describe("ReviewFlowSettings", () => {
  it("muestra las dos opciones con el copy acordado", () => {
    const html = render();
    expect(html).toContain("Flujo de reseñas");
    expect(html).toContain("Feedback privado + Google");
    expect(html).toContain(
      "El cliente puede contarte su experiencia dentro de Flikker y después dejar una reseña en Google.",
    );
    expect(html).toContain("Directo a Google");
    expect(html).toContain(
      "El cliente va directamente a tu perfil de Google para dejar su reseña.",
    );
  });

  function buttons(html: string): string[] {
    const starts = [...html.matchAll(/<button/g)].map((m) => m.index!);
    return starts.map((start, i) =>
      html.slice(start, i + 1 < starts.length ? starts[i + 1] : undefined),
    );
  }

  it("marca PRIVATE_FEEDBACK como seleccionada cuando ese es el mode actual", () => {
    const [privateButton, directButton] = buttons(
      render({ mode: "PRIVATE_FEEDBACK" }),
    );
    expect(privateButton).toContain('aria-checked="true"');
    expect(directButton).toContain('aria-checked="false"');
  });

  it("marca DIRECT_GOOGLE como seleccionada cuando ese es el mode actual", () => {
    const [privateButton, directButton] = buttons(
      render({ mode: "DIRECT_GOOGLE", hasGoogleReviewUrl: true }),
    );
    expect(directButton).toContain('aria-checked="true"');
    expect(privateButton).toContain('aria-checked="false"');
  });

  it("sin Google conectado: DIRECT_GOOGLE queda deshabilitada con el copy de ayuda", () => {
    const html = render({ mode: "PRIVATE_FEEDBACK", hasGoogleReviewUrl: false });
    expect(html).toContain("Conectá tu perfil de Google para usar este modo.");
    const [, directButton] = buttons(html);
    expect(directButton).toContain('disabled=""');
  });

  it("con Google conectado: DIRECT_GOOGLE es elegible", () => {
    const html = render({ mode: "PRIVATE_FEEDBACK", hasGoogleReviewUrl: true });
    const [, directButton] = buttons(html);
    expect(directButton).not.toContain('disabled=""');
  });

  it("sin permiso (canManage=false): las dos opciones quedan deshabilitadas con aviso", () => {
    const html = render({ canManage: false });
    expect(html).toContain("Solo un dueño o administrador puede cambiar esto.");
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });

  it("nunca menciona el puntaje del cliente — la elección es por negocio", () => {
    const html = render();
    expect(html.toLowerCase()).not.toContain("puntaje");
    expect(html.toLowerCase()).not.toContain("estrella");
    expect(html.toLowerCase()).not.toContain("score");
  });
});
