import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { DashboardNextStep } from "./dashboard-overview-types";

/** Sugerencias 100% deterministas — vienen ya calculadas y priorizadas por
 * el backend (dashboard-next-steps.ts). Nunca texto generado acá, solo
 * layout. */
export default function NextStepsCard({ steps }: { steps: DashboardNextStep[] }) {
  return (
    <article className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
      <h3 className="text-base font-bold text-[#1A202C]">Próximos pasos sugeridos</h3>

      {steps.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-[#639922]">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          Todo en orden — no hay nada urgente para revisar ahora.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {steps.map((step) => (
            <li
              key={step.id}
              className="rounded-[12px] border border-[#E8EAF0] bg-[#F9FAFD] p-3.5"
            >
              <p className="text-sm font-semibold text-[#1A202C]">{step.title}</p>
              <p className="mt-1 text-xs text-[#777F96]">{step.description}</p>
              <Link
                href={step.ctaHref}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#5C6BC0] hover:underline"
              >
                {step.ctaLabel}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
