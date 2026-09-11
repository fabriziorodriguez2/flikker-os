import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RewardsTab, { type MyFlikkerReward } from "./rewards-tab";

/**
 * Mi Flikker → Premios.
 *
 * La regla que más importa acá: **un premio que ya no se puede usar no
 * muestra nada accionable**. Ni código, ni QR, ni link al detalle. El
 * backend ya no manda el `redemptionCode` en esos casos, y esta pantalla no
 * debe inventar una forma de llegar igual.
 */
function reward(over: Partial<MyFlikkerReward> = {}): MyFlikkerReward {
  return {
    participationId: "part-1",
    businessId: "biz-a",
    businessName: "Bar Fraternidad",
    businessLogo: null,
    benefitTitle: "1 porción de muzza",
    status: "AVAILABLE",
    redemptionCode: "ABCD1234",
    expiresAt: null,
    redeemedAt: null,
    source: "REWARD_GOAL",
    href: "/beneficio/part-1",
    ...over,
  };
}

const render = (rewards: MyFlikkerReward[], loading = false) =>
  renderToStaticMarkup(<RewardsTab rewards={rewards} loading={loading} />);

const cardOf = (html: string, status: string) =>
  html.split("<li>").find((chunk) => chunk.includes(`data-reward-status="${status}"`)) ?? "";

describe("RewardsTab — disponible", () => {
  it("muestra el premio, el negocio y el estado, y lleva a su detalle", () => {
    const html = render([reward()]);

    expect(html).toContain("1 porción de muzza");
    expect(html).toContain("Bar Fraternidad");
    expect(html).toContain("Disponible");
    // Tocar el premio abre la pantalla de la emisión que YA existe — no hay
    // un segundo componente de QR en el producto.
    expect(html).toContain('href="/beneficio/part-1"');
  });

  it("nunca imprime el código en la lista — eso vive en el detalle", () => {
    expect(render([reward()])).not.toContain("ABCD1234");
  });
});

describe("RewardsTab — canjeado", () => {
  /*
    `redeemedAt`/`expiresAt` son INSTANTES, no day-keys, así que se muestran
    en la zona del que mira — que es lo correcto para "cuándo lo canjeé".
    Las fechas de estos tests son de media tarde UTC a propósito: un
    instante de medianoche UTC cae el día anterior en Montevideo y haría
    que el test dependiera de la zona de quien lo corre, no del código.
  */
  const redeemed = reward({
    status: "REDEEMED",
    redemptionCode: null,
    redeemedAt: "2026-09-08T18:30:00.000Z",
  });

  it("se muestra como histórico, con la fecha de canje", () => {
    const html = render([redeemed]);
    expect(html).toContain("Canjeado el 8 de setiembre");
  });

  it("NO es accionable: sin link, sin QR, sin código", () => {
    const card = cardOf(render([redeemed]), "REDEEMED");

    expect(card).not.toContain("<a ");
    expect(card).not.toContain("href=");
    expect(card).not.toContain("ABCD1234");
    expect(card).not.toContain("Disponible");
  });
});

describe("RewardsTab — vencido", () => {
  const expired = reward({
    status: "EXPIRED",
    redemptionCode: null,
    expiresAt: "2026-09-09T15:00:00.000Z",
  });

  it("se muestra con la fecha de vencimiento", () => {
    expect(render([expired])).toContain("Venció el 9 de setiembre");
  });

  it("NO es accionable: sin link, sin QR, sin código", () => {
    const card = cardOf(render([expired]), "EXPIRED");

    expect(card).not.toContain("<a ");
    expect(card).not.toContain("href=");
    expect(card).not.toContain("ABCD1234");
  });

  it("queda visualmente secundario frente a un disponible", () => {
    const html = render([reward(), expired]);

    // El disponible va sobre superficie blanca; el cerrado sobre el gris
    // apagado del historial.
    expect(cardOf(html, "AVAILABLE")).toContain("bg-white");
    expect(cardOf(html, "EXPIRED")).toContain("bg-[#FAFAFC]");
  });
});

describe("RewardsTab — la lista", () => {
  it("premios de varios negocios conviven en la misma lista", () => {
    const html = render([
      reward({ participationId: "p-a", businessName: "Bar Fraternidad" }),
      reward({ participationId: "p-b", businessName: "Cafetería Fabri" }),
    ]);

    expect(html).toContain("Bar Fraternidad");
    expect(html).toContain("Cafetería Fabri");
  });

  it("dos emisiones con el mismo título siguen siendo DOS filas", () => {
    const html = render([
      reward({ participationId: "p-1", href: "/beneficio/p-1" }),
      reward({ participationId: "p-2", href: "/beneficio/p-2" }),
    ]);

    expect(html.match(/1 porción de muzza/g)).toHaveLength(2);
    expect(html).toContain('href="/beneficio/p-1"');
    expect(html).toContain('href="/beneficio/p-2"');
  });

  it("sin premios: estado vacío con salida a Lugares", () => {
    const html = render([]);

    expect(html).toContain("Todavía no tenés premios");
    expect(html).toContain("Cuando desbloquees un beneficio, aparece acá.");
    expect(html).toContain("Ver mis lugares");
    expect(html).toContain('href="/mi-flikker"');
  });

  it("mientras carga no dice 'no tenés premios' — eso sería mentira", () => {
    const html = render([], true);

    expect(html).toContain("Cargando");
    expect(html).not.toContain("Todavía no tenés premios");
  });
});
