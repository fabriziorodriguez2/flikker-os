import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChallengeRow from "./challenge-row";

const source = readFileSync(join(__dirname, "challenge-row.tsx"), "utf8");
const tabSource = readFileSync(
  join(__dirname, "../../app/(public)/mi-flikker/challenges-tab.tsx"),
  "utf8",
);
const detailSource = readFileSync(
  join(
    __dirname,
    "../../app/(public)/mi-flikker/[businessId]/place-detail-client.tsx",
  ),
  "utf8",
);
const checkinSource = readFileSync(
  join(__dirname, "../../app/(public)/check-in/[token]/checkin-client.tsx"),
  "utf8",
);

function render(props: Partial<React.ComponentProps<typeof ChallengeRow>> = {}) {
  return renderToStaticMarkup(
    <ChallengeRow kind="mission" title="Vení 3 veces" {...props} />,
  );
}

describe("ChallengeRow — variantes", () => {
  it("misión: icono de objetivo y progreso real", () => {
    const html = render({ progress: { current: 2, target: 3 } });
    expect(html).toContain("lucide-target");
    expect(html).toContain('aria-label="2 de 3"');
  });

  it("racha: icono de llama", () => {
    expect(render({ kind: "streak", title: "Racha de 3 semanas" })).toContain(
      "lucide-flame",
    );
  });

  it("desafío de vuelta: icono de reloj de arena", () => {
    expect(
      render({ kind: "return_challenge", title: "Desafío de vuelta" }),
    ).toContain("lucide-hourglass");
  });

  it("completado: cambia el icono a tilde, sin emojis", () => {
    const html = render({ status: "completed" });
    expect(html).toContain("lucide-check");
    expect([...html].every((c) => c.codePointAt(0)! < 0x2190)).toBe(true);
  });
});

describe("ChallengeRow — nunca inventa datos", () => {
  it("sin progreso no dibuja puntitos", () => {
    expect(render()).not.toContain('role="img"');
  });

  it("un target en 0 tampoco dibuja progreso", () => {
    expect(render({ progress: { current: 0, target: 0 } })).not.toContain(
      'role="img"',
    );
  });

  it("sin premio no renderiza la fila de premio", () => {
    expect(render()).not.toContain("lucide-gift");
  });

  it("sin deadline no inventa una fecha", () => {
    expect(render()).not.toMatch(/hasta el|antes del/i);
  });
});

describe("ChallengeRow — el negocio solo donde corresponde", () => {
  it("lista global: nombra el negocio", () => {
    const html = render({
      showBusiness: true,
      business: { name: "Bar Fraternidad" },
    });
    expect(html).toContain("Bar Fraternidad");
  });

  it("dentro de un negocio: no lo repite", () => {
    const html = render({ business: { name: "Bar Fraternidad" } });
    expect(html).not.toContain("Bar Fraternidad");
  });
});

describe("ChallengeRow — una sola implementación", () => {
  it("las tres superficies usan este componente y ninguna dibuja el suyo", () => {
    for (const src of [tabSource, detailSource, checkinSource]) {
      expect(src).toContain("<ChallengeRow");
    }
    // Los componentes viejos ya no existen.
    expect(tabSource).not.toMatch(/function (MissionRow|StreakCard|ReturnChallengeRow)\(/);
    expect(detailSource).not.toMatch(/function PlaceChallenges\(/);
    expect(checkinSource).not.toMatch(/function (MissionCard|ReturnChallengeDone)\(/);
  });

  it("el check-in usa la variante compacta, no otro componente", () => {
    expect(checkinSource).toContain('variant="card"');
  });
});

describe("ChallengeRow — theming", () => {
  it("toma los tokens del negocio y cae al chrome de Flikker sin ellos", () => {
    const html = render();
    expect(html).toContain("var(--pub-surface, #FFFFFF)");
    expect(html).toContain("var(--pub-text, #171A2B)");
    expect(source).not.toMatch(/#5C6BC0|bg-white/);
  });
});
