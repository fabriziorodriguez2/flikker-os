import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guarda de cableado, mismo criterio que
 * `(panel)/layout-onboarding-guard.test.ts`: este repo no tiene
 * infraestructura de rendering para montar un `loading.tsx` real y verlo
 * aparecer/desaparecer con la navegación, así que esto prueba el cableado
 * real leyendo el código fuente.
 *
 * Objetivo (pedido explícito): eliminar los skeletons/spinners distintos por
 * pantalla — cada `loading.tsx` de ruta debe usar el mismo
 * `<RouteProgressBar />`, nunca su propio skeleton "a mano". Cualquier
 * `loading.tsx` nuevo que no lo use rompe este test — es la barrera contra
 * volver a los ~15 loaders distintos.
 */
describe("dashboard/**/loading.tsx — todos usan el mismo RouteProgressBar", () => {
  const routesWithLoadingTsx = [
    "loading.tsx",
    "campaigns/loading.tsx",
    "customers/loading.tsx",
    "insights/loading.tsx",
    "qr/loading.tsx",
    "reviews/loading.tsx",
    "widgets/loading.tsx",
    "programa/loading.tsx",
  ];

  it.each(routesWithLoadingTsx)("%s renderiza <RouteProgressBar />, sin skeleton propio", (relativePath) => {
    const source = readFileSync(join(__dirname, relativePath), "utf-8");
    expect(source).toContain(
      'import RouteProgressBar from "@/components/ui/route-progress-bar"',
    );
    expect(source).toContain("<RouteProgressBar />");
    // Ningún skeleton "a mano" (animate-pulse) debería sobrevivir acá.
    expect(source).not.toContain("animate-pulse");
  });
});

/**
 * Primera ola pedida explícitamente: Clientes, Programa, Insights, Reviews.
 * Insights ya queda cubierto arriba (su única carga es la de ruta, es un
 * Server Component). Acá se verifica la carga PRINCIPAL client-side de las
 * otras tres — nunca los loaders chicos dentro de un botón guardando o de un
 * estado informativo (esos se dejan a propósito, pedido explícito).
 */
describe("Clientes / Programa / Reviews — su carga principal usa RouteProgressBar", () => {
  it("customers-loyalty-client.tsx: la lista completa usa RouteProgressBar, no un spinner propio", () => {
    const source = readFileSync(
      join(__dirname, "customers/customers-loyalty-client.tsx"),
      "utf-8",
    );
    expect(source).toContain("<RouteProgressBar />");
    expect(source).not.toContain("Loader2");
  });

  it("customer-detail-content.tsx: el drawer de detalle usa RouteProgressBar mientras carga", () => {
    const source = readFileSync(
      join(__dirname, "customers/customer-detail-content.tsx"),
      "utf-8",
    );
    expect(source).toContain("<RouteProgressBar />");
    expect(source).not.toContain("Loader2");
  });

  it("programa-client.tsx: la carga principal usa RouteProgressBar", () => {
    const source = readFileSync(
      join(__dirname, "programa/programa-client.tsx"),
      "utf-8",
    );
    expect(source).toContain("<RouteProgressBar />");
    expect(source).not.toContain("Loader2");
  });

  it("reviews-client.tsx: la carga principal usa RouteProgressBar, pero el sync en curso y el botón Guardar conservan su propio Loader2 (dan contexto puntual)", () => {
    const source = readFileSync(
      join(__dirname, "reviews/reviews-client.tsx"),
      "utf-8",
    );
    expect(source).toContain("<RouteProgressBar />");
    // A propósito: NO se reemplazan estos dos usos de Loader2.
    expect(source).toContain("Sincronizando historial de Google");
    expect(source.match(/Loader2/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Segunda ola (auditoría de cierre, pedido explícito) — el resto de las
 * cargas principales bajo Check-in V2 (Inicio, QR, un sub-tab de Programa,
 * Notificaciones, Settings, Sucursales/Miembros compartidos, Widgets).
 * Deliberadamente NO incluye retention-v2/*, checkins-client.tsx,
 * benefits-client.tsx, quick-attend.tsx ni conversion-section.tsx/
 * conversion-by-origin-section.tsx/contacts-stats-section.tsx: los primeros
 * tres son rutas absorbidas (un dueño Check-in V2 real nunca las ve,
 * `redirectIfAbsorbed` lo manda a otro lado antes) y los últimos tres son
 * código LEGACY o directamente muerto (nunca importado por nadie).
 */
describe("Segunda ola — Inicio, QR, Notificaciones, Settings, Sucursales/Miembros, Widgets", () => {
  const mainLoadFiles = [
    "home-client.tsx",
    "qr/qr-nfc-client.tsx",
    "programa/program-incentives-section.tsx",
    "notificaciones/automations-tab.tsx",
    "notificaciones/history-tab.tsx",
    "settings/checkin-v2-business-settings.tsx",
    "settings/suscripcion/checkin-v2-subscription-client.tsx",
    "branches/page.tsx",
    "members/page.tsx",
    "widgets/page.tsx",
  ];

  it.each(mainLoadFiles)("%s: su carga principal usa RouteProgressBar", (relativePath) => {
    const source = readFileSync(join(__dirname, relativePath), "utf-8");
    expect(source).toContain(
      'import RouteProgressBar from "@/components/ui/route-progress-bar"',
    );
    expect(source).toContain("<RouteProgressBar />");
  });

  it("branches/page.tsx y members/page.tsx ya no tienen el skeleton de página completa a mano", () => {
    for (const relativePath of ["branches/page.tsx", "members/page.tsx"]) {
      const source = readFileSync(join(__dirname, relativePath), "utf-8");
      expect(source).not.toContain("animate-pulse");
    }
  });

  it("widgets/page.tsx: el preview en vivo conserva su propio loader chico (contexto puntual, no es la carga principal)", () => {
    const source = readFileSync(join(__dirname, "widgets/page.tsx"), "utf-8");
    expect(source).toContain("previewLoading");
    expect(source).toMatch(/previewLoading[\s\S]{0,60}animate-pulse/);
  });
});
