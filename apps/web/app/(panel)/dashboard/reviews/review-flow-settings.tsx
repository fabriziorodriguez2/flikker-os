"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Card from "@/components/ui/card";

export type ReviewFlowMode = "PRIVATE_FEEDBACK" | "DIRECT_GOOGLE";

interface ReviewFlowOption {
  value: ReviewFlowMode;
  title: string;
  description: string;
}

const OPTIONS: ReviewFlowOption[] = [
  {
    value: "PRIVATE_FEEDBACK",
    title: "Feedback privado + Google",
    description:
      "El cliente puede contarte su experiencia dentro de Flikker y después dejar una reseña en Google.",
  },
  {
    value: "DIRECT_GOOGLE",
    title: "Directo a Google",
    description:
      "El cliente va directamente a tu perfil de Google para dejar su reseña.",
  },
];

/**
 * "Flujo de reseñas" — elección por negocio, nunca por puntaje del cliente
 * (Parte 6). Vive en Reseñas, no en Configuración: es donde el dueño ya
 * está mirando el estado de Google.
 *
 * `DIRECT_GOOGLE` solo puede elegirse con un destino real de Google ya
 * configurado — el backend lo exige igual (`BusinessesService.update`),
 * esto es nada más la UX de no ofrecer una opción que el backend va a
 * rechazar.
 */
export default function ReviewFlowSettings({
  businessId,
  mode,
  hasGoogleReviewUrl,
  canManage,
  onSaved,
}: {
  businessId: string;
  mode: ReviewFlowMode;
  hasGoogleReviewUrl: boolean;
  canManage: boolean;
  onSaved: (mode: ReviewFlowMode) => void;
}) {
  const [saving, setSaving] = useState<ReviewFlowMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: ReviewFlowMode) {
    if (next === mode || saving) return;
    setError(null);
    setSaving(next);
    try {
      const res = await fetch(`/api/proxy/businesses/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewFlowMode: next }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          data &&
          typeof data === "object" &&
          "message" in data &&
          typeof (data as Record<string, unknown>).message === "string"
            ? ((data as Record<string, unknown>).message as string)
            : "No pudimos guardar el cambio. Probá de nuevo.";
        setError(Array.isArray(message) ? message.join(" ") : message);
        return;
      }
      onSaved(next);
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-bold text-[color:var(--panel-text)]">
        Flujo de reseñas
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const active = option.value === mode;
          const disabled =
            !canManage ||
            saving !== null ||
            (option.value === "DIRECT_GOOGLE" && !hasGoogleReviewUrl && !active);
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => void choose(option.value)}
              className={`flex flex-col items-start gap-1 rounded-[var(--panel-radius-control)] border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? "border-[color:var(--panel-accent)] bg-[color:var(--panel-accent-soft,rgba(109,74,255,0.06))]"
                  : "border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] hover:border-[color:var(--panel-accent)]"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--panel-text)]">
                <span
                  className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                    active
                      ? "border-[color:var(--panel-accent)] bg-[color:var(--panel-accent)]"
                      : "border-[color:var(--panel-border)]"
                  }`}
                />
                {option.title}
                {saving === option.value ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
              </span>
              <span className="text-xs leading-5 text-[color:var(--panel-text-muted)]">
                {option.description}
              </span>
              {option.value === "DIRECT_GOOGLE" && !hasGoogleReviewUrl ? (
                <span className="text-xs font-semibold text-[color:var(--panel-warning-text,#B45309)]">
                  Conectá tu perfil de Google para usar este modo.
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-3 text-xs font-semibold text-[color:var(--panel-danger-text)]"
        >
          {error}
        </p>
      ) : null}
      {!canManage ? (
        <p className="mt-3 text-xs text-[color:var(--panel-text-muted)]">
          Solo un dueño o administrador puede cambiar esto.
        </p>
      ) : null}
    </Card>
  );
}
