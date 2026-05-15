"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useCanMutate } from "@/app/(panel)/role-context";
import { FEATURES } from "@/src/config/features";

interface ReviewRowActionsProps {
  reviewId: string;
  isHighlighted: boolean;
  isResponded: boolean;
}

function actionClass(tone: "default" | "accent") {
  if (tone === "accent") {
    return "rounded-full border border-[color:rgba(145,136,245,0.22)] bg-[color:rgba(145,136,245,0.1)] px-3 py-2 text-xs font-semibold text-[color:var(--brand-primary)] hover:border-[color:var(--brand-accent)]";
  }

  return "rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]";
}

export default function ReviewRowActions({
  reviewId,
  isHighlighted,
  isResponded,
}: ReviewRowActionsProps) {
  const canMutate = useCanMutate();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canMutate) return null;

  async function runAction(path: string) {
    setError(null);

    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "No se pudo actualizar la reseña");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar reseña");
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() =>
            runAction(
              `/api/proxy/reviews/${reviewId}/${isHighlighted ? "unhighlight" : "highlight"}`,
            )
          }
          disabled={isPending}
          className={actionClass("accent")}
        >
          {isPending && !error
            ? "Guardando..."
            : isHighlighted
              ? "Quitar highlight"
              : "Highlight"}
        </button>

        {FEATURES.MANUAL_RESPONSES ? (
          <button
            type="button"
            onClick={() =>
              runAction(
                `/api/proxy/reviews/${reviewId}/${isResponded ? "mark-unresponded" : "mark-responded"}`,
              )
            }
            disabled={isPending}
            className={actionClass("default")}
          >
            {isPending && !error
              ? "Guardando..."
              : isResponded
                ? "Marcar pendiente"
                : "Marcar respondida"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="max-w-[220px] text-right text-xs text-[color:var(--danger-text)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
