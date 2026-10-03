import { renderToStaticMarkup } from "react-dom/server";
import UpgradeClient from "./upgrade-client";

// `UpgradeClient` usa `useRouter()` (para "Seguir con el plan gratis"), que
// exige el contexto del App Router — inexistente en `renderToStaticMarkup`
// (no hay jsdom/RTL en este repo). Se mockea solo para poder renderizar; el
// click en sí (y el `router.push`) no se ejecuta en estos tests.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

/**
 * `renderToStaticMarkup` no ejecuta `onClick`/`useState` entre renders (no
 * hay DOM/jsdom en este repo) — lo que se prueba acá es la forma inicial
 * del markup: el campo de WhatsApp, su prefill, y que FREE nunca entra a
 * esta pantalla (no hay ningún test de eso acá porque esta pantalla es
 * exclusivamente para quien YA tiene `pendingUpgradePlan` — ver el guard en
 * `page.tsx`). La secuencia real de guardar-y-recién-ahí-pagar vive en
 * `lib/notification-whatsapp.ts` (lógica pura) y en los tests de backend de
 * `PreOnboardingCheckoutService`.
 */
const render = (
  props: Partial<Parameters<typeof UpgradeClient>[0]> = {},
) =>
  renderToStaticMarkup(
    <UpgradeClient
      pendingPlan="MONTHLY"
      initialNotificationWhatsapp={null}
      {...props}
    />,
  );

describe("UpgradeClient — WhatsApp antes de pagar (Parte 5E)", () => {
  it("pide WhatsApp antes de los dos botones de checkout", () => {
    const html = render();
    expect(html).toContain("WhatsApp");
    expect(html).toContain(
      "Lo usaremos para enviarte la confirmación y ayudarte con la puesta en marcha.",
    );
    expect(html.indexOf("WhatsApp")).toBeLessThan(
      html.indexOf("Continuar con Mercado Pago"),
    );
  });

  it("sin WhatsApp guardado: el campo arranca vacío", () => {
    const html = render({ initialNotificationWhatsapp: null });
    // El input de PhoneInput no trae ningún dígito precargado.
    expect(html).toMatch(/<input[^>]*value=""/);
  });

  it("con WhatsApp ya guardado (+598...): el campo lo prellena en formato nacional", () => {
    const html = render({ initialNotificationWhatsapp: "+59899123456" });
    expect(html).toMatch(/<input[^>]*value="99123456"/);
  });

  it("nunca menciona promociones ni pide consentimiento de marketing", () => {
    const html = render();
    const lower = html.toLowerCase();
    expect(lower).not.toContain("promoci");
    expect(lower).not.toContain("marketing");
  });

  it("sigue mostrando mensual y anual con su copy real", () => {
    const html = render();
    expect(html).toContain("Pagás mes a mes.");
    expect(html).toContain("Pagás 10 meses y usás 12");
  });

  it("sigue ofreciendo seguir con el plan gratis", () => {
    expect(render()).toContain("Seguir con el plan gratis");
  });
});
