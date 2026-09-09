import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BenefitCard from "./benefit-card";

const source = readFileSync(join(__dirname, "benefit-card.tsx"), "utf8");

function render(props: Partial<React.ComponentProps<typeof BenefitCard>> = {}) {
  return renderToStaticMarkup(
    <BenefitCard title="1 porción de muzza" {...props} />,
  );
}

describe("BenefitCard — estados", () => {
  it("AVAILABLE con reveal=tap: pide mostrar el código, no lo expone de entrada", () => {
    const html = render({ code: "YMU6QT3Z", reveal: "tap" });
    expect(html).toContain("Mostrar mi código");
    expect(html).not.toContain("YMU6QT3Z");
  });

  it("AVAILABLE con reveal=none: muestra el código directo", () => {
    const html = render({ code: "YMU6QT3Z", reveal: "none" });
    expect(html).toContain("YMU6QT3Z");
    expect(html).not.toContain("Mostrar mi código");
  });

  it("REDEEMED: dice que ya se usó y no ofrece ningún canje", () => {
    const html = render({ code: "YMU6QT3Z", redeemed: true, reveal: "none" });
    expect(html).toContain("Ya usaste este beneficio");
    // El rótulo acompaña al estado: nunca "disponible" sobre algo canjeado.
    expect(html).toContain("Beneficio usado");
    expect(html).not.toContain("Beneficio disponible");
    expect(html).not.toContain("Mostrar mi código");
    expect(html).not.toContain("YMU6QT3Z");
  });

  it("REDEEMED: nunca dibuja una tarjeta nueva 0/N", () => {
    const html = render({ redeemed: true });
    expect(html).not.toMatch(/0\s*\/\s*\d/);
    expect(html).not.toMatch(/de 6|de 8/);
    expect(source).not.toMatch(/LoyaltyCard|RewardGoalStamps/);
  });

  it("sin código no inventa un bloque de canje", () => {
    const html = render({ code: null });
    expect(html).not.toContain("Mostrar mi código");
    expect(html).not.toContain("Mostralo al personal");
  });
});

describe("BenefitCard — datos reales solamente", () => {
  it("no muestra vencimiento si esa superficie no lo pasa", () => {
    expect(render()).not.toMatch(/vence/i);
  });

  it("muestra las filas de meta que sí llegan, tal cual", () => {
    const html = render({
      meta: [
        { label: "Vence", value: "9/9/2026" },
        { label: "Ganado", value: "visita 12" },
      ],
    });
    expect(html).toContain("Vence");
    expect(html).toContain("9/9/2026");
    expect(html).toContain("visita 12");
  });

  it("no trae reglas globales inventadas", () => {
    expect(source).not.toMatch(/un beneficio por visita/i);
    expect(source).not.toMatch(/Se cierra en|countdown|setInterval/);
  });
});

describe("BenefitCard — reveal reusa RedemptionReveal", () => {
  it("el QR y el código legible salen del componente compartido", () => {
    expect(source).toContain('import RedemptionReveal from "./redemption-reveal"');
    expect(source).toContain("<RedemptionReveal");
    // Sin QR propio: nada de duplicar la generación.
    expect(source).not.toMatch(/QRCode\.toDataURL/);
  });

  it("la variante slide reusa el sello deslizable compartido", () => {
    expect(source).toContain('import SlideToReveal from "./slide-to-reveal"');
  });
});

describe("BenefitCard — theming", () => {
  it("usa tokens --pub-* con fallback, sin colores fijos de card", () => {
    const html = render();
    expect(html).toContain("var(--pub-surface");
    expect(html).toContain("var(--pub-text");
    expect(html).not.toMatch(/class="[^"]*\bbg-white/);
    expect(source).not.toMatch(/rgba\(14, 17, 29/);
  });
});
