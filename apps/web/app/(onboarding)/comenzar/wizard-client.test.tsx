import { readFileSync } from "fs";
import { join } from "path";
import { isBusinessStepValid } from "./wizard-client";

const wizard = readFileSync(join(__dirname, "wizard-client.tsx"), "utf8");
const shell = readFileSync(join(__dirname, "wizard-shell.tsx"), "utf8");
const programCard = readFileSync(
  join(
    __dirname,
    "..",
    "..",
    "(panel)",
    "dashboard",
    "programa",
    "program-card-section.tsx",
  ),
  "utf8",
);
const programStamps = readFileSync(
  join(
    __dirname,
    "..",
    "..",
    "(panel)",
    "dashboard",
    "programa",
    "program-stamps-section.tsx",
  ),
  "utf8",
);

describe("/comenzar — asistente de programa", () => {
  it("valida nombre y categoría del Paso 1", () => {
    expect(isBusinessStepValid("A", "cafeteria")).toBe(false);
    expect(isBusinessStepValid("Café Central", "inexistente")).toBe(false);
    expect(isBusinessStepValid("Café Central", "cafeteria")).toBe(true);
  });

  it("Paso 1 ofrece la elección de flujo de reseñas, sin llamar a ninguna 'recomendada' (Parte 6)", () => {
    expect(wizard).toContain("¿Cómo querés recibir las reseñas?");
    expect(wizard).toContain("Feedback privado primero");
    expect(wizard).toContain(
      "El cliente puede contarte su experiencia dentro de Flikker y después dejar una reseña en Google.",
    );
    expect(wizard).toContain("Directo a Google");
    expect(wizard).toContain(
      "El cliente va directamente a tu perfil de Google para dejar su reseña.",
    );
    expect(wizard).not.toContain("recomendad");
    expect(wizard).not.toContain("mejor opción");
  });

  it("la elección de reseñas viaja en el mismo POST del paso 1, nunca gating por puntaje", () => {
    const saveBusinessBody = wizard.slice(
      wizard.indexOf("async function saveBusiness"),
      wizard.indexOf("async function finishBenefitsOnly"),
    );
    expect(saveBusinessBody).toContain('post("business"');
    expect(saveBusinessBody).toContain("reviewFlowMode");
    expect(saveBusinessBody).not.toContain("score");
    expect(saveBusinessBody).not.toContain("puntaje");
  });

  it("default PRIVATE_FEEDBACK — no cambia el comportamiento actual si el dueño no toca nada", () => {
    expect(wizard).toContain('"PRIVATE_FEEDBACK" | "DIRECT_GOOGLE"');
    expect(wizard).toContain('>("PRIVATE_FEEDBACK")');
  });

  it("mantiene las dos elecciones de programa y un estado seleccionado explícito", () => {
    expect(wizard).toContain('setMode("benefits")');
    expect(wizard).toContain('setMode("benefits_stamps")');
    expect(wizard).toContain("aria-pressed={selected}");
    expect(wizard).toContain("Seleccionado");
  });

  it("permite agregar, editar y eliminar el beneficio opcional", () => {
    expect(wizard).toContain("Agregar beneficio");
    expect(wizard).toContain("Guardar cambios");
    expect(wizard).toContain("editDraftBenefit(index)");
    expect(wizard).toContain("removeDraftBenefit(index)");
  });

  it("permite terminar Beneficios sin crear ninguno y usa el endpoint correcto", () => {
    expect(wizard).toContain('post("benefits-only", { benefits: draftBenefits })');
    expect(wizard).toContain('nextLabel="Terminar configuración"');
    const benefitsOnly = wizard.slice(
      wizard.indexOf("async function finishBenefitsOnly"),
      wizard.indexOf("async function finishBenefitsAndStamps"),
    );
    expect(benefitsOnly).not.toContain('post("program"');
  });

  it("sellos configura recompensa, meta y bonus sin sumar un tercer paso", () => {
    expect(wizard).toContain('marker="A"');
    expect(wizard).toContain('marker="B"');
    expect(wizard).toContain('marker="C"');
    expect(wizard).toContain("feedbackBonusEnabled: feedbackBonus");
    expect(shell).toContain("Paso {step} de {totalSteps}");
    expect(wizard).toContain("totalSteps={TOTAL_STEPS}");
  });

  it("el preview de sellos reutiliza LoyaltyCard real", () => {
    expect(wizard).toContain(
      'import LoyaltyCard from "@/components/public/loyalty-card"',
    );
    expect(wizard).toContain("<LoyaltyCard");
    expect(wizard).not.toContain("RewardGoalStamps");
  });

  it("el shell es responsive: editor primero, preview apilado y sticky en desktop", () => {
    expect(shell).toContain("lg:grid-cols-[minmax(0,1fr)_340px]");
    expect(shell).toContain("lg:sticky");
    expect(shell).toContain("max-w-6xl");
  });
});

describe("Programa — negocio sin sellos activos", () => {
  it("conserva beneficios y ofrece una única activación directa", () => {
    expect(programCard).toContain("Solo beneficios");
    expect(programCard).toContain("Tarjeta de sellos");
    expect(programCard).toContain("Desactivada");
    expect(programCard).toContain("Activá sellos si también querés premiar");
    expect(programCard).toContain("compactDisabled");
    expect(programCard).not.toContain("Tu programa es de beneficios");
  });

  it("la configuración compacta habilita meta, recompensa y bonus privado", () => {
    expect(programStamps).toContain("Activar tarjeta de sellos");
    expect(programStamps).toContain("Cada visita válida suma 1 sello");
    expect(programStamps).toContain("+1 sello por dejar feedback privado");
    expect(programStamps).toContain(": feedbackBonus");
  });
});
