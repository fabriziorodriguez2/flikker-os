import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastProvider } from "./toast";

/**
 * Sin RTL en el repo (ver `layout-onboarding-guard.test.ts`), así que lo que
 * se puede probar por render es la superficie estática. Las reglas de
 * comportamiento (dedupe, auto-dismiss, success solo tras confirmar) se
 * prueban abajo leyendo el contrato en el código, mismo criterio que las
 * otras guardas de cableado del repo.
 */
describe("ToastProvider — superficie", () => {
  it("renderiza a sus hijos y un viewport accesible aunque no haya ningún toast", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <p>contenido</p>
      </ToastProvider>,
    );
    expect(html).toContain("contenido");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("el viewport no bloquea clicks del panel que tiene debajo", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <span />
      </ToastProvider>,
    );
    expect(html).toContain("pointer-events-none");
  });
});

describe("toast.tsx — reglas que hacen confiable la confirmación", () => {
  const source = readFileSync(join(__dirname, "toast.tsx"), "utf-8");

  it("deduplica: mismo tipo + mismo mensaje dentro de la ventana no se apila", () => {
    expect(source).toContain("DEDUPE_MS");
    expect(source).toMatch(/now - previous < DEDUPE_MS.*\n?\s*return/);
  });

  it("cada tipo tiene su propio auto-dismiss", () => {
    expect(source).toMatch(/AUTO_DISMISS_MS[\s\S]{0,120}success:/);
    expect(source).toMatch(/AUTO_DISMISS_MS[\s\S]{0,160}error:/);
    expect(source).toMatch(/AUTO_DISMISS_MS[\s\S]{0,160}warning:/);
  });

  it("fuera del provider devuelve un no-op en vez de tirar (pantallas compartidas con LEGACY)", () => {
    expect(source).toContain("useContext(ToastContext) ?? NOOP");
  });

  it("limpia los timers al desmontar", () => {
    expect(source).toContain("clearTimeout");
  });
});

/**
 * La regla más importante del pedido: "no mostrar success hasta que backend
 * confirme realmente el write". Se verifica en los call sites — que el
 * `toast.success` esté DESPUÉS del `await` de la escritura, nunca antes.
 */
describe("call sites — el success va después de que el backend confirmó", () => {
  const root = join(__dirname, "..", "..", "app", "(panel)", "dashboard");

  it("Programa: el success vive dentro de withToast, después de readJson", () => {
    const source = readFileSync(
      join(root, "programa", "programa-client.tsx"),
      "utf-8",
    );
    const helper = source.slice(
      source.indexOf("async function withToast"),
      source.indexOf("async function saveBrand"),
    );
    // El orden importa: primero se espera la acción, después se confirma.
    expect(helper.indexOf("await action()")).toBeLessThan(
      helper.indexOf("toast.success"),
    );
    expect(helper).toContain("toast.error");
  });

  it("Promociones: un envío parcial NO se anuncia como éxito", () => {
    const source = readFileSync(
      join(root, "notificaciones", "promotions-tab.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/result\.failed === 0[\s\S]{0,200}toast\.success/);
    expect(source).toMatch(/result\.sent > 0[\s\S]{0,160}toast\.warning/);
    expect(source).toMatch(/else \{[\s\S]{0,120}toast\.error/);
  });

  it("Settings: el success va después de readJson(response)", () => {
    const source = readFileSync(
      join(root, "settings", "checkin-v2-business-settings.tsx"),
      "utf-8",
    );
    expect(source.indexOf("await readJson(response)")).toBeLessThan(
      source.indexOf('toast.success("Configuración guardada")'),
    );
  });

  it("QR: el success va después del await de la mutation", () => {
    const source = readFileSync(
      join(root, "qr", "qr-nfc-client.tsx"),
      "utf-8",
    );
    const block = source.slice(
      source.indexOf("async function createPoint"),
      source.indexOf("async function repairPrincipal"),
    );
    expect(block.indexOf("await mutate(")).toBeLessThan(
      block.indexOf('toast.success("QR creado")'),
    );
  });

  it("Automatizaciones: el toggle confirma recién después de que el PATCH volvió ok", () => {
    const source = readFileSync(
      join(root, "notificaciones", "automations-tab.tsx"),
      "utf-8",
    );
    const block = source.slice(
      source.indexOf("async function patch("),
      source.indexOf("async function patchSettings("),
    );
    expect(block.indexOf("if (!res.ok) throw")).toBeLessThan(
      block.indexOf("toast.success"),
    );
    expect(block).toContain("toast.error");
  });

  it("Ventana de envío: un guardado fallido ya no pasa desapercibido", () => {
    const source = readFileSync(
      join(root, "notificaciones", "automations-tab.tsx"),
      "utf-8",
    );
    const block = source.slice(source.indexOf("async function patchSettings("));
    expect(block).toContain("if (!res.ok) throw");
    expect(block).toContain("toast.error");
  });

  it("Reviews: guardar la URL de Google confirma solo si res.ok", () => {
    const source = readFileSync(
      join(root, "reviews", "reviews-client.tsx"),
      "utf-8",
    );
    const block = source.slice(
      source.indexOf("async function saveGoogleUrl"),
      source.indexOf("if (error && !data)"),
    );
    expect(block.indexOf("if (res.ok)")).toBeLessThan(
      block.indexOf('toast.success("Cambios guardados")'),
    );
    expect(block).toContain("toast.error");
  });

  it("Beneficios: eliminar uno ya emitido avisa como PARCIAL, no como éxito", () => {
    const source = readFileSync(
      join(root, "programa", "programa-client.tsx"),
      "utf-8",
    );
    const block = source.slice(
      source.indexOf("async function deleteBenefit"),
      source.indexOf("async function saveBenefitTerms"),
    );
    expect(block).toMatch(/data\?\.retired[\s\S]{0,160}toast\.warning/);
    expect(block).toContain('toast.success("Beneficio eliminado")');
  });

  it("QR imprimible: ya no marca 'guardado' sin mirar la respuesta", () => {
    const source = readFileSync(
      join(root, "qr", "qr-print-studio.tsx"),
      "utf-8",
    );
    const block = source.slice(source.indexOf("async function handleSave"));
    expect(block).toContain("if (!res.ok) throw");
    expect(block.indexOf("if (!res.ok) throw")).toBeLessThan(
      block.indexOf("toast.success"),
    );
  });
});
