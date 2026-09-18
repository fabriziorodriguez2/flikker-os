import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Guarda de cableado del upsell, mismo criterio que el resto de los
 * `*-wiring.test.ts` del repo: lo que se prueba acá es DÓNDE aparece el
 * upsell y dónde no, que no se puede verificar renderizando un componente
 * suelto.
 *
 * La regla que protege: el upsell aparece en contexto y en pocos lugares.
 * Un banner permanente en todas las pantallas es un cambio de dos líneas —
 * estos tests lo convierten en un cambio que además hay que justificar
 * borrando un test.
 */
describe("Upsell Free → Pro: aparece en contexto, no en todos lados", () => {
  const dashboard = __dirname;
  const read = (...segments: string[]) =>
    readFileSync(join(dashboard, ...segments), "utf-8");

  describe("Inicio", () => {
    const home = read("home-client.tsx");

    it("tiene el medidor de uso, y un solo bloque de plan", () => {
      expect(home).toContain("PlanUsageMeter");
      expect(home.match(/<HomePlanBlock/g) ?? []).toHaveLength(1);
    });

    /*
      La condición no la evalúa el frontend: el backend manda
      `freePlanUsage: null` para Pro y para cualquier negocio sin tope, y
      el bloque no se dibuja. Un solo lugar decide, y es el que conoce el
      plan de verdad.
    */
    it("el bloque de plan desaparece para Pro y para negocios sin tope", () => {
      expect(home).toContain("if (!usage) return null;");
      expect(home).not.toMatch(/isPro\s*\?/);
    });

    /*
      Inicio ya es la pantalla más cargada del panel. Un paywall completo
      acá compite con la operación diaria: el bloque de plan es un medidor,
      no una oferta.
    */
    it("Inicio no monta un paywall completo", () => {
      expect(home).not.toContain("ProUpgradePrompt");
    });

    it("un fallo al leer el plan nunca rompe la portada", () => {
      const block = home.slice(home.indexOf("function HomePlanBlock"));
      expect(block).toContain("if (!res.ok) return;");
      expect(block).toContain("} catch {");
    });
  });

  describe("Insights", () => {
    const page = read("insights", "insights-v2-page.tsx");

    it("la oportunidad se muestra después del impacto real, no antes", () => {
      expect(page.indexOf("<ImpactCard")).toBeLessThan(
        page.indexOf("<RecoveryOpportunityCard"),
      );
    });

    /*
      Si no se pudo leer el plan, `isPro` queda en `true` y el prompt no se
      muestra. Ante la duda, no vender — el default opuesto le mostraría un
      paywall a un negocio que ya paga.
    */
    it("sin dato de plan asume Pro y no muestra el paywall", () => {
      expect(page).toContain("let isPro = true;");
      expect(page).toContain("subscription?.isPro !== false");
    });
  });

  describe("Automatizaciones", () => {
    const tab = read("notificaciones", "automations-tab.tsx");

    it("el paywall se abre por acción del dueño, nunca al entrar", () => {
      expect(tab).toContain("useState(false)");
      // El ÚNICO lugar que lo abre es el click del CTA de la fila
      // bloqueada. Si apareciera una segunda apertura (un efecto al montar,
      // un timer, una respuesta del backend), este conteo lo delata.
      const opens = tab.match(/setProModalOpen\(true\)/g) ?? [];
      expect(opens).toHaveLength(1);
      expect(tab).toContain("onLockedClick={() => setProModalOpen(true)}");
    });

    it("el modal siempre ofrece salir", () => {
      const modal = tab.slice(
        tab.indexOf('feature="cumpleanos"'),
        tab.indexOf("/>", tab.indexOf('feature="cumpleanos"')),
      );
      expect(modal).toContain('label: "Ahora no"');
      expect(modal).toContain("onDismiss");
    });

    /*
      Cumpleaños es la ÚNICA automatización que `PlansService` gatea por
      plan (`hasProAccess` en `updateAutomations`). "Te extrañamos",
      "Cerca del premio" y "Sellos por vencer" no lo son: ponerles un badge
      PRO sería vender algo que el backend ya permite gratis.
    */
    it("solo Cumpleaños tiene paywall — las otras tres no", () => {
      expect(tab.match(/onLockedClick=/g) ?? []).toHaveLength(1);
      expect(tab.match(/<ProUpgradePrompt/g) ?? []).toHaveLength(1);
      expect(tab).toContain('feature="cumpleanos"');
    });
  });

  describe("dónde NO va", () => {
    it("Reseñas no tiene upsell: no hay ninguna feature de plan ahí", () => {
      const reviews = read("reviews", "reviews-client.tsx");
      expect(reviews).not.toContain("ProUpgradePrompt");
      expect(reviews).not.toContain("PlanUsageMeter");
    });

    /*
      La regla más importante de todo este sistema: el cliente final nunca
      ve un paywall. Quien se topa con el tope del plan es una persona que
      quiso sumarse a un programa de un bar — no tiene nada que comprar, y
      mostrarle el problema comercial del negocio sería trasladarle algo que
      no le corresponde. El aviso es SOLO para el dueño, en el panel.
    */
    it("ninguna superficie customer-facing importa el paywall", () => {
      const publicDirs = [
        join(dashboard, "..", "..", "(public)"),
        join(dashboard, "..", "..", "..", "components", "public"),
      ];

      const offenders: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          if (!/\.tsx?$/.test(entry.name)) continue;
          if (entry.name.includes(".test.")) continue;
          const source = readFileSync(full, "utf-8");
          if (
            source.includes("ProUpgradePrompt") ||
            source.includes("PlanUsageMeter") ||
            source.includes("PlanLimitSignal") ||
            source.includes("free-plan-usage")
          ) {
            offenders.push(full);
          }
        }
      };
      for (const dir of publicDirs) walk(dir);

      expect(offenders).toEqual([]);
    });
  });

  describe("el aviso de tope alcanzado", () => {
    it("Inicio le pasa al medidor los rechazos reales de la semana", () => {
      const home = read("home-client.tsx");
      expect(home).toContain("blockedLast7Days={usage.blockedCustomersLast7Days}");
      // El bloque entero depende de `freePlanUsage`, que el backend manda en
      // `null` para Pro — así desaparece al actualizar el plan, sin lógica
      // propia en el frontend.
      expect(home).toContain("parseFreePlanUsage");
      expect(home).toContain("if (!usage) return null;");
    });

    it("Insights separa la señal de capacidad de las métricas de performance", () => {
      const page = read("insights", "insights-v2-page.tsx");
      expect(page.indexOf("<PlanLimitSignal")).toBeLessThan(
        page.indexOf("<FlikkerPerformance"),
      );
    });

    /*
      §9: el dueño tiene que descubrir el problema, no ser perseguido por
      él. Nada de esto puede abrirse por su cuenta ni repetirse al navegar.
    */
    it("no hay modal automático, toast ni banner rojo por el tope", () => {
      // Solo el código DEL AVISO, no el archivo entero: Inicio tiene su
      // propio banner rojo de "no pudimos cargar", que no tiene nada que
      // ver con esto.
      const home = read("home-client.tsx");
      const planBlock = home.slice(home.indexOf("function HomePlanBlock"));
      const sources = [
        planBlock,
        read("insights", "plan-limit-signal.tsx"),
        read("insights", "insights-v2-page.tsx"),
      ];

      for (const source of sources) {
        expect(source).not.toContain('variant="modal"');
        expect(source).not.toContain("toast.");
        expect(source).not.toMatch(/bg-red-|bg-\[#C0392B\]/);
      }
    });
  });
});
