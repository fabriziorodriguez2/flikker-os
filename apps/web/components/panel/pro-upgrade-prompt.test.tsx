import { renderToStaticMarkup } from "react-dom/server";
import ProUpgradePrompt from "./pro-upgrade-prompt";
import PlanUsageMeter from "./plan-usage-meter";

/**
 * El paywall y el medidor de uso, probados por lo que RENDERIZAN.
 *
 * Lo que estos tests protegen no es el diseño: es la política. Un sistema de
 * upsell se degrada solo — alguien agrega un cuarto beneficio "porque
 * entra", alguien saca el "Ahora no" del modal, alguien hace que el medidor
 * grite a los 10 clientes. Cada uno de esos cambios es chico y razonable
 * por separado, y juntos convierten el producto en lo que este sistema
 * decidió no ser.
 */
describe("ProUpgradePrompt", () => {
  const base = {
    feature: "reactivacion_automatica",
    title: "Recuperación automática",
    description: "Flikker contacta a los que dejaron de venir.",
  };

  it("nunca muestra más de 3 beneficios, aunque le pasen más", () => {
    const html = renderToStaticMarkup(
      <ProUpgradePrompt
        {...base}
        benefits={["Uno", "Dos", "Tres", "Cuatro", "Cinco"]}
      />,
    );
    expect(html).toContain("Uno");
    expect(html).toContain("Tres");
    expect(html).not.toContain("Cuatro");
    expect(html).not.toContain("Cinco");
  });

  it("sin evidencia real no inventa ninguna", () => {
    const html = renderToStaticMarkup(<ProUpgradePrompt {...base} />);
    // Solo el TEXTO visible: las clases de Tailwind y los SVG de lucide
    // están llenos de dígitos que no son contenido.
    const visibleText = html.replace(/<[^>]*>/g, " ");
    expect(visibleText).toContain("Recuperación automática");
    // Si el negocio no aportó un dato, no aparece ningún número.
    expect(visibleText).not.toMatch(/\d/);
  });

  it("muestra la evidencia tal cual se la pasan", () => {
    const html = renderToStaticMarkup(
      <ProUpgradePrompt {...base} evidence="8 clientes hace tiempo que no vuelven." />,
    );
    expect(html).toContain("8 clientes hace tiempo que no vuelven.");
  });

  it("el CTA lleva a Suscripción, no directo al checkout de pago", () => {
    const html = renderToStaticMarkup(<ProUpgradePrompt {...base} />);
    expect(html).toContain('href="/dashboard/settings/suscripcion"');
    expect(html).not.toContain("mpago");
  });

  it("todas las variantes renderizan el badge PRO y el CTA", () => {
    for (const variant of ["inline", "card", "modal", "compact"] as const) {
      const html = renderToStaticMarkup(
        <ProUpgradePrompt {...base} variant={variant} />,
      );
      expect(html).toContain("Pro");
      expect(html).toContain("/dashboard/settings/suscripcion");
    }
  });

  it("el modal es un dialog accesible y conserva la salida secundaria", () => {
    const html = renderToStaticMarkup(
      <ProUpgradePrompt
        {...base}
        variant="modal"
        secondaryAction={{ label: "Ahora no", onClick: () => {} }}
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Ahora no");
  });

  it("el copy por defecto no usa urgencia ni culpa", () => {
    const html = renderToStaticMarkup(
      <ProUpgradePrompt {...base} variant="card" />,
    );
    for (const darkPattern of [
      "YA!",
      "Última oportunidad",
      "Estás perdiendo",
      "No te lo pierdas",
      "quedan pocas horas",
    ]) {
      expect(html).not.toContain(darkPattern);
    }
  });
});

describe("PlanUsageMeter", () => {
  it("sin tope (Pro) no se renderiza nada", () => {
    expect(renderToStaticMarkup(<PlanUsageMeter used={120} limit={null} />)).toBe(
      "",
    );
  });

  it("lejos del límite es neutral: muestra los números, sin CTA", () => {
    const html = renderToStaticMarkup(<PlanUsageMeter used={12} limit={50} />);
    expect(html).toContain("12 / 50 clientes");
    expect(html).not.toContain("Ver Pro");
    expect(html).not.toContain("Te quedan");
  });

  it("cerca del límite (>=80%) dice cuántos lugares quedan", () => {
    const html = renderToStaticMarkup(<PlanUsageMeter used={41} limit={50} />);
    expect(html).toContain("41 / 50 clientes");
    expect(html).toContain("Te quedan 9 lugares para nuevos clientes.");
    expect(html).toContain("Ver Pro");
  });

  it("singular cuando queda uno solo — nunca “1 lugares”", () => {
    const html = renderToStaticMarkup(<PlanUsageMeter used={49} limit={50} />);
    expect(html).toContain("Te queda 1 lugar para nuevos clientes.");
  });

  it("en el límite lo dice sin dramatizar", () => {
    const html = renderToStaticMarkup(<PlanUsageMeter used={50} limit={50} />);
    expect(html).toContain("Llegaste al límite del plan Gratis.");
    expect(html).not.toContain("perdiendo");
    expect(html).not.toContain("urgente");
  });

  /*
    Pasarse del tope es posible: `canAddParticipant` frena altas nuevas, pero
    un negocio que venía de Pro puede quedar por encima. La barra no puede
    desbordar ni mostrar un porcentaje imposible.
  */
  it("por encima del tope la barra queda en 100%, no se pasa", () => {
    const html = renderToStaticMarkup(<PlanUsageMeter used={73} limit={50} />);
    expect(html).toContain("width:100%");
    expect(html).toContain("Llegaste al límite del plan Gratis.");
  });

  it("expone el progreso a lectores de pantalla", () => {
    const html = renderToStaticMarkup(<PlanUsageMeter used={37} limit={50} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="37"');
    expect(html).toContain('aria-valuemax="50"');
  });

  /*
    La parte más delicada del copy. El número de personas bloqueadas sale de
    `COUNT(DISTINCT customer_id)` sobre rechazos reales — si es 0, no hay
    ninguna afirmación que hacer sobre demanda perdida, así que se habla en
    futuro. Confundir los dos casos sería inventar clientes perdidos.
  */
  describe("clientes que no pudieron sumarse", () => {
    it("en el límite sin rechazos medidos: habla en futuro, sin ningún número", () => {
      const html = renderToStaticMarkup(
        <PlanUsageMeter used={50} limit={50} blockedLast7Days={0} />,
      );
      expect(html).toContain(
        "Los próximos clientes nuevos no podrán sumarse hasta que amplíes el plan.",
      );
      expect(html).not.toContain("no pudieron sumarse");
      expect(html).not.toContain("Esta semana");
    });

    it("con rechazos reales: dice cuántas personas fueron", () => {
      const html = renderToStaticMarkup(
        <PlanUsageMeter used={50} limit={50} blockedLast7Days={4} />,
      );
      expect(html).toContain(
        "Esta semana 4 clientes nuevos no pudieron sumarse.",
      );
      expect(html).not.toContain("Los próximos clientes nuevos");
    });

    it("singular con una sola persona", () => {
      const html = renderToStaticMarkup(
        <PlanUsageMeter used={50} limit={50} blockedLast7Days={1} />,
      );
      expect(html).toContain("Esta semana 1 cliente nuevo no pudo sumarse.");
    });

    it("cerca del límite pero sin llegar: no menciona rechazos", () => {
      const html = renderToStaticMarkup(
        <PlanUsageMeter used={44} limit={50} blockedLast7Days={0} />,
      );
      expect(html).toContain("Te quedan 6 lugares");
      expect(html).not.toContain("no podrán sumarse");
    });

    it("sin tope (Pro) no se muestra nada, ni siquiera con rechazos históricos", () => {
      const html = renderToStaticMarkup(
        <PlanUsageMeter used={80} limit={null} blockedLast7Days={9} />,
      );
      expect(html).toBe("");
    });
  });
});
