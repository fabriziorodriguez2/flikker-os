import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RewardGoalStamps from "./reward-goal-stamps";

/**
 * La regla visual de los sellos: **el círculo es el SLOT, el sello es del
 * negocio**.
 *
 * Cada posición de la grilla es siempre el mismo círculo, esté completa o
 * no; lo único que cambia es el contenido. Antes esto no era así — el sello
 * vacío era circular y el completado perdía el contenedor (`border-0`, sin
 * fondo), así que la grilla mezclaba círculos con íconos sueltos flotando.
 * El test que fijaba ESO ("como ícono solo") se reemplazó por estos.
 *
 * Lo que NUNCA puede pasar: que el ícono del negocio se cambie por un tick,
 * una estrella o cualquier cosa inventada por Flikker. El sello pertenece al
 * negocio; el marco (el círculo) es de Flikker.
 */

function render(
  icon: string | null,
  over: { progress?: number; target?: number } = {},
) {
  return renderToStaticMarkup(
    <RewardGoalStamps
      progress={over.progress ?? 2}
      target={over.target ?? 8}
      cardColor="#F8F4EE"
      stampAreaColor="#FFFFFF"
      stampColor="#8B5E3C"
      icon={icon}
    />,
  );
}

/**
 * Los slots se parten por su marcador de apertura en vez de con una regex
 * que intente balancear `</span>` — el contenido tiene spans anidados (el
 * SVG de lucide, la máscara del sello propio) y cualquier regex "hasta el
 * cierre" se come varios slots de una.
 */
const slots = (html: string) =>
  html
    .split('<span data-stamp-state=')
    .slice(1)
    .map((chunk) => `<span data-stamp-state=${chunk}`);
const completedSlots = (html: string) =>
  slots(html).filter((slot) => slot.startsWith('<span data-stamp-state="completed"'));
const emptySlots = (html: string) =>
  slots(html).filter((slot) => slot.startsWith('<span data-stamp-state="empty"'));
const firstCompleted = (html: string) =>
  html.match(/<span data-stamp-state="completed"[^>]*>/)?.[0];
const firstEmpty = (html: string) =>
  html.match(/<span data-stamp-state="empty"[^>]*>/)?.[0];

describe("RewardGoalStamps — el círculo es el slot", () => {
  it("slot vacío → círculo (con borde y número, sin ícono)", () => {
    const html = render("coffee");
    const empty = firstEmpty(html);

    expect(empty).toContain("rounded-full");
    expect(empty).toContain("border-width:1.5px");
    expect(html).toContain("03"); // el número de esa posición
  });

  it("slot completado → TAMBIÉN círculo, no un ícono suelto", () => {
    const completed = firstCompleted(render("coffee"));

    expect(completed).toContain("rounded-full");
    // El círculo se pinta con el acento del negocio: eso es lo que lo hace
    // leer como un slot lleno y no como un ícono flotando.
    expect(completed).toContain("background-color:#8B5E3C");
  });

  it("el ícono va DENTRO del círculo, sin un segundo círculo alrededor", () => {
    const html = render("coffee");
    const slot = completedSlots(html)[0];

    // Un solo `rounded-full` por slot — si hubiera un círculo anidado
    // habría dos.
    expect(slot?.match(/rounded-full/g) ?? []).toHaveLength(1);
    expect(slot).toContain("<svg");
  });
});

describe("RewardGoalStamps — el sello es del negocio", () => {
  it("configurado `coffee` → el círculo lleva Coffee", () => {
    const html = render("coffee");
    // lucide-react marca cada ícono con su clase `lucide-<nombre>`.
    expect(html).toContain("lucide-coffee");
    expect(html).not.toContain("lucide-check");
  });

  it("configurado `utensils` → el círculo lleva Utensils", () => {
    const html = render("utensils");
    expect(html).toContain("lucide-utensils");
    expect(html).not.toContain("lucide-check");
  });

  it("negocio A y negocio B muestran sellos DISTINTOS", () => {
    const a = render("utensils");
    const b = render("coffee");

    expect(a).toContain("lucide-utensils");
    expect(b).toContain("lucide-coffee");
    expect(a).not.toContain("lucide-coffee");
    expect(b).not.toContain("lucide-utensils");
  });

  it("sello personalizado (data:image) → se respeta tal cual, con la misma máscara de siempre", () => {
    const customIcon =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
    const html = render(customIcon);

    expect(html).toContain("mask-image:url(&quot;data:image/svg+xml");
    // Nunca se convierte a un ícono de Lucide ni a un `<img>` aparte: es el
    // mismo renderer de máscara, no un segundo camino.
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<img");
    // Y sigue viéndose: la máscara va en el color legible SOBRE el acento,
    // no en el acento mismo (sería invisible sobre su propio círculo).
    const slot = completedSlots(html)[0];
    expect(slot).toContain("background-color:#8B5E3C"); // el círculo
    expect(slot).toContain("mask-size:contain"); // aspect ratio respetado
  });

  it("sin stampIcon configurado → fallback de Flikker (Gift), nunca un tick", () => {
    const html = render(null);
    expect(html).toContain("lucide-gift");
    expect(html).not.toContain("lucide-check");
  });

  it("NUNCA aparece un Check salvo que el negocio lo haya elegido explícitamente", () => {
    for (const icon of ["coffee", "utensils", "star", "heart", null]) {
      expect(render(icon)).not.toContain("lucide-check");
    }
    // Solo cuando `check` es literalmente la elección del dueño.
    expect(render("check")).toContain("lucide-check");
  });
});

describe("RewardGoalStamps — el progreso lo decide el backend", () => {
  it("4 de 6 → exactamente 4 slots completos y 2 vacíos", () => {
    const html = render("coffee", { progress: 4, target: 6 });

    expect(completedSlots(html)).toHaveLength(4);
    expect(emptySlots(html)).toHaveLength(2);
  });

  it("progreso mayor al target → clamp visual, nunca más slots que el target", () => {
    const html = render("coffee", { progress: 9, target: 6 });

    expect(completedSlots(html)).toHaveLength(6);
    expect(emptySlots(html)).toHaveLength(0);
    expect(slots(html)).toHaveLength(6);
    // La etiqueta accesible también dice el número acotado, no el crudo.
    expect(html).toContain("6 de 6 sellos");
  });
});
