"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

/**
 * Shell único del onboarding self-service. Los 7 pasos comparten este marco
 * para que se sienta un solo flujo continuo y no siete módulos distintos.
 */
export default function WizardShell({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  aside,
  onBack,
  onNext,
  nextLabel = "Continuar",
  nextDisabled = false,
  secondary,
  saving = false,
  error,
}: {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Columna lateral en desktop (preview). Se apila abajo en mobile. */
  aside?: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  secondary?: { label: string; onClick: () => void };
  saving?: boolean;
  error?: string | null;
}) {
  const pct = Math.round((step / totalSteps) * 100);

  return (
    <main className="min-h-dvh bg-[#F7F8FC] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-7">
          <div className="flex items-center justify-between gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/flikker-logotype.svg" alt="Flikker" className="h-6 w-auto" />
            <span className="font-mono text-xs font-semibold text-[#8891A4]">
              Paso {step} de {totalSteps}
            </span>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#E8EAF0]">
            <div
              className="h-full rounded-full bg-[#5C6BC0] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </header>

        <div className={aside ? "grid gap-6 lg:grid-cols-[1fr_300px]" : ""}>
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.03em] text-[#171A2B] sm:text-[32px]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-[15px] leading-6 text-[#7B8295]">
                {subtitle}
              </p>
            ) : null}

            <div className="mt-7">{children}</div>

            {error ? (
              <p className="mt-5 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
                {error}
              </p>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onNext}
                disabled={nextDisabled || saving}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#5C6BC0] px-6 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(92,107,192,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[#4f5eb0] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:flex-none sm:min-w-[180px]"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {nextLabel}
              </button>
              {secondary ? (
                <button
                  type="button"
                  onClick={secondary.onClick}
                  disabled={saving}
                  className="inline-flex h-12 items-center justify-center rounded-[14px] px-5 text-sm font-semibold text-[#5C6BC0] transition-colors hover:bg-[#EEF0FB] disabled:opacity-50"
                >
                  {secondary.label}
                </button>
              ) : null}
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  disabled={saving}
                  className="inline-flex h-12 items-center gap-1.5 rounded-[14px] px-3 text-sm font-semibold text-[#8891A4] transition-colors hover:text-[#171A2B] disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4" /> Atrás
                </button>
              ) : null}
            </div>
          </div>

          {aside ? <aside className="lg:pt-2">{aside}</aside> : null}
        </div>
      </div>
    </main>
  );
}

export const fieldClass =
  "mt-1.5 w-full rounded-[12px] border border-[#E3E5F0] bg-white px-4 py-3 text-[15px] text-[#171A2B] outline-none transition-colors placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

export const labelClass =
  "text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]";
