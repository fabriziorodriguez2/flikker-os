"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import FlikkerSelect from "@/components/ui/flikker-select";
import ProgramSectionHeading from "./program-section-heading";
import type { LoyaltyProgramOverview, ProgramBenefit } from "./types";

const MAX_LEN = 500;

/**
 * "Términos y condiciones" — las bases legales del programa.
 *
 * Auditado antes de construir esto: el modelo no tiene un campo de programa
 * a nivel negocio para esto — lo que YA existe, y lo que YA se muestra al
 * cliente en la landing de check-in (`landing.benefit.terms`), es
 * `Benefit.terms`, por beneficio. No se inventó un campo nuevo: esta sección
 * edita el `terms` del beneficio elegido con el mismo `PATCH /benefits/:id`
 * que ya existe. Por default abre el que hoy es la recompensa de la tarjeta
 * (el que más frecuentemente ve el cliente en esa pantalla).
 */
export default function ProgramTermsSection({
  overview,
  benefits,
  canMutate,
  onSave,
}: {
  overview: LoyaltyProgramOverview;
  benefits: ProgramBenefit[];
  canMutate: boolean;
  onSave: (benefitId: string, terms: string) => Promise<void>;
}) {
  const defaultBenefitId = overview.reward?.benefitId ?? benefits[0]?.id ?? "";
  const [benefitId, setBenefitId] = useState(defaultBenefitId);
  const [terms, setTerms] = useState(
    benefits.find((b) => b.id === defaultBenefitId)?.terms ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTerms(benefits.find((b) => b.id === benefitId)?.terms ?? "");
    setSaved(false);
  }, [benefitId, benefits]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(benefitId, terms.trim());
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (benefits.length === 0) {
    return (
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-8 text-center">
        <h2 className="font-display text-base font-bold text-[#1A202C]">
          Términos y condiciones
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[#8891A4]">
          Creá al menos un beneficio en{" "}
          <span className="font-semibold text-[#5C6BC0]">Beneficios</span> para
          poder escribirle sus bases legales.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-6">
      <ProgramSectionHeading
        icon={FileText}
        title="Términos y condiciones"
        description="Las bases del beneficio elegido — se muestran al cliente en la página de inscripción y en su tarjeta."
      />

      <div className="mt-5">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Beneficio
          </span>
          <FlikkerSelect
            value={benefitId}
            disabled={!canMutate}
            onChange={setBenefitId}
            ariaLabel="Beneficio"
            className="mt-1"
            options={benefits.map((benefit) => ({
              value: benefit.id,
              label: benefit.title,
              description:
                overview.reward?.benefitId === benefit.id
                  ? "Recompensa de la tarjeta"
                  : undefined,
            }))}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Bases legales
          </span>
          <textarea
            value={terms}
            disabled={!canMutate}
            maxLength={MAX_LEN}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Válido de lunes a viernes. No acumulable con otras promociones. Un beneficio por cliente."
            rows={5}
            className="mt-1 w-full resize-none rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
          />
          <p className="mt-1 text-xs text-[#8891A4]">
            {terms.length}/{MAX_LEN}
          </p>
        </label>
      </div>

      {saved ? (
        <p className="mt-3 text-sm font-semibold text-[#1D9E75]">Guardado.</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-[#C0392B]">{error}</p> : null}

      {canMutate ? (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flk-glossy inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar términos
          </button>
        </div>
      ) : null}
    </section>
  );
}
