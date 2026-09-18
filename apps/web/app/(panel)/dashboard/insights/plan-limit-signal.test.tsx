import { renderToStaticMarkup } from "react-dom/server";
import PlanLimitSignal from "./plan-limit-signal";
import type { FreePlanUsage } from "@/lib/free-plan-usage";

/**
 * La señal de capacidad en Insights. Lo que se protege acá es que no se
 * convierta en una métrica de negocio: aparece solo con evidencia real, y
 * dice explícitamente que la causa es el plan y no la actividad del local.
 */
function usage(overrides: Partial<FreePlanUsage> = {}): FreePlanUsage {
  return {
    current: 50,
    limit: 50,
    blockedCustomersLast7Days: 4,
    blockedCustomersThisMonth: 11,
    ...overrides,
  };
}

describe("PlanLimitSignal", () => {
  it("con rechazos reales muestra cuántas personas y el uso del tope", () => {
    const html = renderToStaticMarkup(<PlanLimitSignal usage={usage()} />);
    expect(html).toContain("Tu plan llegó al límite");
    expect(html).toContain("Seguí sumando clientes");
    expect(html).toContain(
      "Esta semana 4 clientes nuevos no pudieron completar el alta.",
    );
    expect(html).toContain("Estás en 50 de 50.");
  });

  it("sin rechazos medidos no se muestra: Insights no adivina demanda", () => {
    const html = renderToStaticMarkup(
      <PlanLimitSignal usage={usage({ blockedCustomersLast7Days: 0 })} />,
    );
    expect(html).toBe("");
  });

  it("debajo del tope no se muestra", () => {
    const html = renderToStaticMarkup(
      <PlanLimitSignal
        usage={usage({ current: 37, blockedCustomersLast7Days: 0 })}
      />,
    );
    expect(html).toBe("");
  });

  /*
    `usage` llega en `null` para Pro y para negocios sin tope. Ese único
    hecho es lo que hace desaparecer la señal al actualizar el plan.
  */
  it("Pro o sin tope (usage null): no se muestra", () => {
    expect(renderToStaticMarkup(<PlanLimitSignal usage={null} />)).toBe("");
  });

  it("aclara que no es una caída de actividad", () => {
    const html = renderToStaticMarkup(<PlanLimitSignal usage={usage()} />);
    expect(html).toContain("no es una caída de tu actividad");
  });

  it("usa el slug de feature acordado", () => {
    const html = renderToStaticMarkup(<PlanLimitSignal usage={usage()} />);
    expect(html).toContain('data-pro-feature="customer_limit"');
  });

  it("el CTA es “Ampliar capacidad” y lleva a Suscripción", () => {
    const html = renderToStaticMarkup(<PlanLimitSignal usage={usage()} />);
    expect(html).toContain("Ampliar capacidad");
    expect(html).toContain('href="/dashboard/settings/suscripcion"');
  });

  it("singular con una sola persona bloqueada", () => {
    const html = renderToStaticMarkup(
      <PlanLimitSignal usage={usage({ blockedCustomersLast7Days: 1 })} />,
    );
    expect(html).toContain(
      "Esta semana 1 cliente nuevo no pudo completar el alta.",
    );
  });
});
