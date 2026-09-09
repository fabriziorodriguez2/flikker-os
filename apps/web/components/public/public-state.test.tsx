import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Gift, Hourglass } from "lucide-react";
import PublicState from "./public-state";

const dir = join(__dirname, "../../app/(public)");
const checkinNotFound = readFileSync(
  join(dir, "check-in/[token]/not-found.tsx"),
  "utf8",
);
const benefitNotFound = readFileSync(
  join(dir, "beneficio/[id]/not-found.tsx"),
  "utf8",
);
const placeNotFound = readFileSync(
  join(dir, "mi-flikker/[businessId]/not-found.tsx"),
  "utf8",
);
const feedbackNotFound = readFileSync(
  join(dir, "r/[token]/not-found.tsx"),
  "utf8",
);

describe("PublicState", () => {
  it("una acción principal, como link navegable", () => {
    const html = renderToStaticMarkup(
      <PublicState
        icon={Gift}
        title="No encontramos ese beneficio"
        description="Tus premios activos están en Mi Flikker."
        action={{ label: "Ver mis premios", href: "/mi-flikker" }}
      />,
    );
    expect(html).toContain("No encontramos ese beneficio");
    expect(html).toContain('href="/mi-flikker"');
    expect(html).toContain("Ver mis premios");
  });

  it("sin acción no renderiza botones vacíos", () => {
    const html = renderToStaticMarkup(
      <PublicState icon={Gift} title="Todavía no tenés desafíos" />,
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
  });

  it("usa tokens --pub-* con fallback y el icono de lucide", () => {
    const html = renderToStaticMarkup(
      <PublicState icon={Hourglass} title="Este link ya venció" tone="warning" />,
    );
    expect(html).toContain("lucide-hourglass");
    expect(html).toContain("var(--pub-text, #171A2B)");
  });
});

describe("Estados de error públicos", () => {
  const files = {
    "check-in": checkinNotFound,
    beneficio: benefitNotFound,
    "detalle de lugar": placeNotFound,
    feedback: feedbackNotFound,
  };

  it("todos usan el componente único, no un 404 suelto", () => {
    for (const [name, src] of Object.entries(files)) {
      expect(`${name}:${src.includes("<PublicState")}`).toBe(`${name}:true`);
    }
  });

  it("cada uno ofrece exactamente una acción principal", () => {
    for (const [name, src] of Object.entries(files)) {
      const actions = src.match(/action=\{\{/g) ?? [];
      expect(`${name}:${actions.length}`).toBe(`${name}:1`);
    }
  });

  it("ninguno revela IDs, tokens ni motivos internos", () => {
    for (const [name, src] of Object.entries(files)) {
      // Nada de interpolar params ni de explicar por qué falló.
      expect(`${name}:${/\{params|\{token|\{id\}|businessId\}/.test(src)}`).toBe(
        `${name}:false`,
      );
      expect(
        `${name}:${/no existe|inválido|no autorizado|no es tuyo/i.test(src.split("*/").pop() ?? "")}`,
      ).toBe(`${name}:false`);
    }
  });

  it("el copy no culpa al cliente", () => {
    for (const [name, src] of Object.entries(files)) {
      const visible = src.split("*/").pop() ?? "";
      expect(`${name}:${/error tuyo|hiciste mal|equivocaste/i.test(visible)}`).toBe(
        `${name}:false`,
      );
    }
  });
});
