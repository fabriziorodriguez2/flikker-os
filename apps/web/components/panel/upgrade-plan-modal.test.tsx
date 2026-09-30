import { renderToStaticMarkup } from "react-dom/server";
import UpgradePlanModal from "./upgrade-plan-modal";
import {
  PRO_MONTHLY_CHECKOUT_URL,
  PRO_YEARLY_CHECKOUT_URL,
  yearlyPriceFrom,
} from "@/lib/checkout-urls";

/**
 * El modal que manda a pagar. Lo que estos tests protegen es plata real y
 * honestidad: que cada CTA vaya al checkout que dice ir, que el precio
 * mostrado sea el que se cobra, y que el anual gane por valor y no por
 * esconder al mensual.
 */
const PRICE = { currency: "UYU", amount: 1000 };

const render = (props: Partial<Parameters<typeof UpgradePlanModal>[0]> = {}) =>
  renderToStaticMarkup(
    <UpgradePlanModal
      feature="test"
      monthlyPrice={PRICE}
      onClose={() => {}}
      {...props}
    />,
  );

describe("UpgradePlanModal", () => {
  describe("los checkouts reales", () => {
    it("mensual apunta exactamente al checkout mensual", () => {
      expect(render()).toContain('href="https://mpago.la/1Acxajh"');
    });

    it("anual apunta exactamente al checkout anual", () => {
      expect(render()).toContain('href="https://mpago.la/2hsbeMy"');
    });

    it("los dos links salen de la configuración central", () => {
      const html = render();
      expect(html).toContain(`href="${PRO_MONTHLY_CHECKOUT_URL}"`);
      expect(html).toContain(`href="${PRO_YEARLY_CHECKOUT_URL}"`);
      expect(PRO_MONTHLY_CHECKOUT_URL).not.toBe(PRO_YEARLY_CHECKOUT_URL);
    });

    it("cada CTA lleva su plan marcado, para no confundirlos", () => {
      const html = render();
      expect(html).toContain('data-plan="monthly"');
      expect(html).toContain('data-plan="yearly"');
    });
  });

  describe("copy y precios", () => {
    it("título y subtítulo acordados", () => {
      const html = render();
      expect(html).toContain("Pasate a Flikker Pro");
      expect(html).toContain(
        "Desbloqueá todo el potencial de Flikker para hacer volver más clientes.",
      );
    });

    it("el anual dice “Pagás 10 meses y usás 12”", () => {
      // El texto se arma con las constantes, así que se normalizan los
      // espacios del JSX antes de comparar.
      const text = render().replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      expect(text).toContain("Pagás 10 meses y usás 12");
    });

    it("el anual dice “2 meses incluidos”", () => {
      const text = render().replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      expect(text).toContain("2 meses incluidos");
    });

    it("el mensual dice “Pagás mes a mes.”", () => {
      expect(render()).toContain("Pagás mes a mes.");
    });

    /*
      El precio anual es el mensual × 10. No un número escrito a mano: si
      alguien cambia el precio en Mercado Pago y el backend lo refleja, el
      modal lo sigue solo.
    */
    it("el precio anual se calcula desde el mensual real", () => {
      const html = render();
      expect(yearlyPriceFrom(PRICE.amount)).toBe(10000);
      expect(html).toContain("UYU 1.000");
      expect(html).toContain("UYU 10.000");
    });

    it("el ahorro es real: 12 meses menos lo que se paga", () => {
      expect(render()).toContain("Ahorrás UYU 2.000 al año");
    });

    /*
      Sin precio confiable del backend, las cards salen igual pero SIN
      número. Inventar uno que no coincida con el checkout sería peor que
      no mostrar ninguno.
    */
    it("sin precio confiable no inventa ninguno, pero muestra las cards", () => {
      const html = render({ monthlyPrice: null });
      expect(html).toContain("Elegir mensual");
      expect(html).toContain("Elegir anual");
      expect(html).not.toContain("/mes");
      expect(html).not.toContain("/año");
      expect(html).not.toContain("Ahorrás");
    });
  });

  describe("jerarquía sin dark patterns", () => {
    it("el anual tiene el badge “Mejor opción” y borde violeta", () => {
      const html = render();
      expect(html).toContain("Mejor opción");
      expect(html).toContain("border-[#6D4AFF]");
    });

    /*
      El mensual tiene MENOS jerarquía, no menos legibilidad. Su CTA es un
      botón completo con texto oscuro sobre blanco — no un link gris
      escondido, que es el patrón que este modal se niega a usar.
    */
    it("el mensual sigue siendo una opción completa y legible", () => {
      const html = render();
      const monthly = html.slice(
        html.indexOf("Mensual"),
        html.indexOf("Mejor opción"),
      );
      expect(monthly).toContain("Elegir mensual");
      expect(monthly).toContain("text-[#1A202C]");
      expect(monthly).toContain("UYU 1.000");
    });

    it("no usa urgencia, descuentos falsos ni preselección", () => {
      const html = render();
      for (const pattern of [
        "Última oportunidad",
        "Solo hoy",
        "por tiempo limitado",
        "Antes UYU",
        "checked",
        "countdown",
      ]) {
        expect(html).not.toContain(pattern);
      }
    });
  });

  describe("accesibilidad", () => {
    it("es un dialog con título y descripción asociados", () => {
      const html = render();
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="upgrade-modal-title"');
      expect(html).toContain('aria-describedby="upgrade-modal-subtitle"');
    });

    it("el botón de cerrar está etiquetado", () => {
      expect(render()).toContain('aria-label="Cerrar"');
    });

    it("los CTAs tienen foco visible", () => {
      const html = render();
      expect(html.match(/focus-visible:ring-\[#6D4AFF\]/g)?.length).toBeGreaterThanOrEqual(
        3,
      );
    });

    /*
      Responsive: apilado en mobile, dos columnas desde `sm`. Los CTAs son
      de 44px de alto (h-11), el mínimo táctil razonable.
    */
    it("apila en mobile y muestra dos columnas en desktop", () => {
      const html = render();
      expect(html).toContain("grid gap-4 sm:grid-cols-2");
      expect(html.match(/h-11/g)?.length).toBe(2);
    });
  });
});
