import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Guarda de cableado del upsell.
 *
 * Lo que se prueba acá no se puede verificar renderizando un componente:
 * DÓNDE aparece el upsell, dónde deliberadamente no, y que haya una sola
 * puerta al checkout. Un sistema de venta se degrada de a poco — un badge
 * acá, un banner allá, un link directo a Mercado Pago "para ahorrar un
 * click" — y cada paso parece razonable por separado.
 */
describe("Upsell Free → Pro: en contexto, una sola puerta al checkout", () => {
  const dashboard = __dirname;
  const webRoot = join(dashboard, "..", "..", "..");
  const read = (...segments: string[]) =>
    readFileSync(join(dashboard, ...segments), "utf-8");

  /** Todos los .ts/.tsx de producción bajo `dir`. */
  function sourcesUnder(dir: string): { path: string; source: string }[] {
    const out: { path: string; source: string }[] = [];
    const walk = (current: string) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (entry.name.includes(".test.")) continue;
        out.push({ path: full, source: readFileSync(full, "utf-8") });
      }
    };
    walk(dir);
    return out;
  }

  describe("una sola fuente de verdad para los checkouts", () => {
    /*
      La regresión concreta que esto evita: la URL mensual llegó a estar
      copiada a mano en tres componentes. El día que Mercado Pago cambie el
      link, tres lugares tienen que acordarse.
    */
    it("solo `lib/checkout-urls.ts` contiene URLs de Mercado Pago", () => {
      const offenders = sourcesUnder(join(webRoot, "app"))
        .concat(sourcesUnder(join(webRoot, "components")))
        .concat(sourcesUnder(join(webRoot, "lib")))
        .filter(({ path, source }) => {
          if (path.endsWith(join("lib", "checkout-urls.ts"))) return false;
          return /mpago\.la/.test(source);
        })
        .map(({ path }) => path);

      expect(offenders).toEqual([]);
    });

    it("define los dos checkouts, distintos entre sí", () => {
      const config = readFileSync(
        join(webRoot, "lib", "checkout-urls.ts"),
        "utf-8",
      );
      expect(config).toContain("https://mpago.la/1Acxajh");
      expect(config).toContain("https://mpago.la/2hsbeMy");
      expect(config).toContain("NEXT_PUBLIC_PRO_MONTHLY_CHECKOUT_URL");
      expect(config).toContain("NEXT_PUBLIC_PRO_YEARLY_CHECKOUT_URL");
    });

    /*
      Solo el modal navega a pagar. Si otro componente importara las URLs,
      podría mandar al checkout sin ofrecer la elección de plan.
    */
    it("solo el modal importa las URLs de checkout", () => {
      const importers = sourcesUnder(join(webRoot, "components"))
        .filter(({ source }) => /PRO_(MONTHLY|YEARLY)_CHECKOUT_URL/.test(source))
        .map(({ path }) => path.split(/[\\/]/).pop());

      expect(importers).toEqual(["upgrade-plan-modal.tsx"]);
    });
  });

  describe("un solo modal, abierto desde un solo lugar", () => {
    it("el provider está montado en el layout del panel", () => {
      const layout = readFileSync(
        join(webRoot, "app", "(panel)", "layout.tsx"),
        "utf-8",
      );
      expect(layout).toContain("<UpgradeModalProvider>");
    });

    /*
      Nadie monta `UpgradePlanModal` por su cuenta: eso sería volver al
      `useState` local por pantalla que el provider existe para evitar.
    */
    it("solo el provider renderiza el modal", () => {
      const mounters = sourcesUnder(join(webRoot, "app"))
        .concat(sourcesUnder(join(webRoot, "components")))
        .filter(({ source }) => /<UpgradePlanModal/.test(source))
        .map(({ path }) => path.split(/[\\/]/).pop());

      expect(mounters).toEqual(["upgrade-modal-provider.tsx"]);
    });

    it("los CTAs de upsell abren el modal, no navegan", () => {
      const prompt = readFileSync(
        join(webRoot, "components", "panel", "pro-upgrade-prompt.tsx"),
        "utf-8",
      );
      const meter = readFileSync(
        join(webRoot, "components", "panel", "plan-usage-meter.tsx"),
        "utf-8",
      );
      for (const source of [prompt, meter]) {
        expect(source).toContain("openUpgradeModal");
        expect(source).not.toContain("settings/suscripcion");
      }
    });
  });

  describe("ante la duda, no vender", () => {
    /*
      `isPro` arranca en `true` y solo baja cuando el backend lo confirma.
      Si la lectura del plan falla, el panel se comporta como Pro: sin
      nudges. Mostrarle "pasate a Pro" a alguien que ya paga es peor que no
      mostrarle nada a alguien que podría pagar.
    */
    it("el provider asume Pro hasta que el backend diga lo contrario", () => {
      const provider = readFileSync(
        join(webRoot, "components", "panel", "upgrade-modal-provider.tsx"),
        "utf-8",
      );
      expect(provider).toContain("useState(true)");
      expect(provider).toContain("v.isPro !== false");
      expect(provider).toContain("showUpsell: !isPro");
    });

    it("los nudges dependen de `freePlanUsage`, que es null para Pro", () => {
      const home = read("home-client.tsx");
      const customers = read("customers", "customers-loyalty-client.tsx");
      for (const source of [home, customers]) {
        expect(source).toContain("if (!freePlanUsage) return null;");
      }
    });
  });

  describe("saturación: máximo una presencia fuerte por pantalla", () => {
    const countCtas = (source: string) =>
      (source.match(/<ProUpgradePrompt|<PlanUsageMeter/g) ?? []).length;

    it("Inicio y Clientes tienen exactamente un medidor", () => {
      expect(countCtas(read("home-client.tsx"))).toBe(1);
      expect(countCtas(read("customers", "customers-loyalty-client.tsx"))).toBe(
        1,
      );
    });

    it("Insights tiene a lo sumo dos, y las dos exigen evidencia real", () => {
      const page = read("insights", "insights-v2-page.tsx");
      const mounted = (page.match(/<RecoveryOpportunityCard|<PlanLimitSignal/g) ?? [])
        .length;
      expect(mounted).toBe(2);

      // Ninguna se dibuja sin un número real del propio negocio.
      expect(read("insights", "recovery-opportunity-card.tsx")).toContain(
        "if (isPro || inactive <= 0) return null;",
      );
      expect(read("insights", "plan-limit-signal.tsx")).toContain(
        "if (blocked <= 0) return null;",
      );
    });

    /*
      Auditado contra el backend: ni Reviews ni QR consultan `PlansService`.
      Son plan base completo. Un badge PRO ahí estaría vendiendo algo que ya
      es gratis.
    */
    it("Reseñas y QR no tienen upsell — no hay ninguna feature Pro ahí", () => {
      for (const dir of ["reviews", "qr"]) {
        for (const { source } of sourcesUnder(join(dashboard, dir))) {
          expect(source).not.toContain("ProUpgradePrompt");
          expect(source).not.toContain("PlanUsageMeter");
          expect(source).not.toContain("openUpgradeModal");
        }
      }
    });

    /*
      Cumpleaños es la ÚNICA automatización que `PlansService` gatea por
      plan (`hasProAccess` en `updateAutomations`). Las otras tres son
      gratis y ponerles un badge sería mentir.
    */
    it("solo Cumpleaños está gateada en Automatizaciones", () => {
      const tab = read("notificaciones", "automations-tab.tsx");
      expect(tab.match(/onLockedClick=/g) ?? []).toHaveLength(1);
      expect(tab).toContain('feature: "birthday"');
    });
  });

  describe("el cliente final nunca ve un paywall", () => {
    /*
      La regla más importante del sistema. Quien se topa con el tope del
      plan es una persona que quiso sumarse al programa de un bar: no tiene
      nada que comprar, y mostrarle el problema comercial del negocio sería
      trasladarle algo que no le corresponde.
    */
    it("ninguna superficie customer-facing importa el upsell", () => {
      const offenders = sourcesUnder(join(webRoot, "app", "(public)"))
        .concat(sourcesUnder(join(webRoot, "components", "public")))
        .filter(({ source }) =>
          /ProUpgradePrompt|PlanUsageMeter|UpgradePlanModal|useUpgradeModal|checkout-urls|mpago/.test(
            source,
          ),
        )
        .map(({ path }) => path);

      expect(offenders).toEqual([]);
    });
  });
});
