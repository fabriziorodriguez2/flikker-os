import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FeedbackForm from "./feedback-form";

const source = readFileSync(join(__dirname, "feedback-form.tsx"), "utf8");
const cardSource = readFileSync(
  join(__dirname, "checkin-feedback-card.tsx"),
  "utf8",
);
const GOOGLE_URL = "https://g.page/r/example/review";

const noop = async () => ({
  alreadySubmitted: false,
  bonusGranted: false,
  offerGoogle: false,
  googleUrl: null,
});

function idle(props: Partial<React.ComponentProps<typeof FeedbackForm>> = {}) {
  return renderToStaticMarkup(<FeedbackForm submit={noop} {...props} />);
}

function googleLinks(html: string) {
  return Array.from(html.matchAll(/href="([^"]+)"/g))
    .map((m) => m[1])
    .filter((href) => href.includes("g.page") || href.includes("google.com"));
}

describe("FeedbackForm — escala", () => {
  it("son 5 estrellas, con aria-label por valor y estado seleccionable", () => {
    const html = idle();
    expect(html.match(/role="radio"/g)).toHaveLength(5);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(html).toContain(`aria-label="${n} de 5"`);
    }
    expect(html).toContain('role="radiogroup"');
  });

  it("usa el Star de lucide — nada de caras, pulgares ni emojis", () => {
    const html = idle();
    expect(html).toContain("lucide-star");
    expect(source).toContain('import { Check, Globe, Loader2, Lock, Star }');
    // Se mira el HTML renderizado, no el texto del archivo: los comentarios
    // hablan de estas cosas justamente para explicar por qué no están.
    expect(html).not.toMatch(/lucide-(thumbs|smile|frown|meh|annoyed)/);
    // Cero emojis reales en el componente (incluye comentarios: tampoco ahí).
    expect([...source].every((c) => c.codePointAt(0)! < 0x2190)).toBe(true);
  });
});

describe("FeedbackForm — la UI no cambia de intención según el puntaje", () => {
  it("no tiene ninguna rama por puntaje", () => {
    // Lo único que mira `score` es si ya hay uno elegido (para habilitar el
    // botón); nunca CUÁL es.
    expect(source).not.toMatch(/score\s*[<>]=?\s*\d/);
    expect(source).not.toMatch(/score\s*===\s*[1-5]\b/);
  });

  it("el comentario está siempre visible, no solo con puntaje bajo", () => {
    const html = idle();
    expect(html).toContain("<textarea");
    expect(html).toContain("Contanos qué estuvo bien o qué mejorarías");
  });

  it("el envío es siempre un botón explícito, nunca automático", () => {
    const html = idle();
    expect(html).toContain("Enviar al local");
    // Elegir estrella solo setea el estado; no dispara el POST.
    expect(source).toMatch(/onClick=\{\(\) => setScore\(value\)\}/);
    expect(source).not.toMatch(/chooseScore|autoSubmit/);
  });
});

describe("FeedbackForm — privacidad y Google", () => {
  it("antes de enviar deja claro que es privado", () => {
    expect(idle()).toContain("Privado · solo lo ve el negocio");
  });

  it("sin Google conectado no renderiza ningún enlace", () => {
    const html = idle({ alreadySubmitted: true, googleUrl: null });
    expect(googleLinks(html)).toHaveLength(0);
    expect(html).toContain("Gracias, ya recibimos tu opinión");
  });

  it("con Google ofrece exactamente un enlace, separado y opcional", () => {
    const html = idle({ alreadySubmitted: true, googleUrl: GOOGLE_URL });
    expect(googleLinks(html)).toEqual([GOOGLE_URL]);
    expect(html).toContain("Dejar una reseña en Google");
    expect(html).toContain("Público · opcional");
    expect(html).toMatch(/no cambia tus sellos/i);
  });

  it("el bloque de Google vive DESPUÉS del envío, nunca en el formulario", () => {
    expect(googleLinks(idle())).toHaveLength(0);
    expect(source).toMatch(/outcome\.offerGoogle && outcome\.googleUrl/);
  });
});

describe("FeedbackForm — ya respondido", () => {
  it("no vuelve a mostrar el formulario editable", () => {
    const html = idle({ alreadySubmitted: true });
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain("Enviar al local");
  });
});

describe("FeedbackForm — sello bonus", () => {
  it("solo se anuncia con la respuesta real del backend", () => {
    // Nunca se deduce del puntaje ni se muestra optimistamente.
    expect(source).toMatch(/outcome\.bonusGranted \? \(/);
    expect(source).toContain("Sumaste +1 sello por dejar tu feedback");
  });

  it("no lo promete de antemano si el negocio no tiene tarjeta activa", () => {
    expect(idle()).not.toContain("1 sello extra");
    expect(idle({ bonusHint: true })).toContain("1 sello extra");
  });
});

describe("FeedbackForm — theming del negocio", () => {
  it("la superficie sale de los tokens --pub-*, no de bg-white fijo", () => {
    const html = idle();
    expect(html).toContain("var(--pub-surface");
    expect(html).toContain("var(--pub-text");
    // Sobre el HTML renderizado: ninguna clase de color fija en la card.
    expect(html).not.toMatch(/class="[^"]*\bbg-white/);
    expect(html).not.toMatch(/class="[^"]*\btext-gray-\d/);
    expect(html).not.toMatch(/class="[^"]*\btext-\[#[0-9A-Fa-f]{6}\]/);
  });

  it("cada token trae fallback claro para el landing sin experiencia pública", () => {
    // `/r/[token]` no define las variables: sin fallback quedaría sin color.
    expect(source).toMatch(/var\(--pub-surface, #FFFFFF\)/);
    expect(source).toMatch(/var\(--pub-text, #171A2B\)/);
    expect(source).toMatch(/var\(--pub-accent, #5C6BC0\)/);
  });
});

describe("FeedbackForm — una sola encuesta para las dos entradas", () => {
  it("la card del check-in es solo un wrapper de contexto", () => {
    expect(cardSource).toContain("<FeedbackForm");
    expect(cardSource).not.toMatch(/<textarea|role="radiogroup"|lucide/);
    // Lo único propio: su endpoint de sesión.
    expect(cardSource).toContain("/api/checkin/session/feedback");
  });
});
