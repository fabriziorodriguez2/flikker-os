"use client";

import { useState } from "react";

export interface NegativeFeedbackItem {
  id: string;
  createdAt: string;
  customerName: string;
  score: number;
  comment: string | null;
  acknowledgedByOwner: boolean;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function NegativeFeedbackList({
  items,
}: {
  items: NegativeFeedbackItem[];
}) {
  const [feedback, setFeedback] = useState(items);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function acknowledge(id: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/proxy/metrics/feedback/${id}/acknowledge`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("No se pudo marcar como leído");
      setFeedback((current) =>
        current.map((item) =>
          item.id === id ? { ...item, acknowledgedByOwner: true } : item,
        ),
      );
    } finally {
      setSavingId(null);
    }
  }

  if (feedback.length === 0) {
    return (
      <div className="rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-sm text-[color:var(--text-muted)]">
        No hay feedback negativo registrado.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feedback.map((item) => (
        <article
          key={item.id}
          className="rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-[color:var(--foreground)]">
                {item.customerName}
              </p>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                {formatDate(item.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {item.acknowledgedByOwner ? (
                <span className="rounded-full bg-[color:rgba(46,125,77,0.1)] px-2.5 py-1 text-xs font-semibold text-[color:#2e7d4d]">
                  Leído
                </span>
              ) : null}
              <span className="rounded-full bg-[color:rgba(161,45,58,0.1)] px-2.5 py-1 text-xs font-semibold text-[color:#a12d3a]">
                {item.score}/5
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
            {item.comment?.trim() || "Sin comentario."}
          </p>
          {!item.acknowledgedByOwner ? (
            <button
              type="button"
              onClick={() => void acknowledge(item.id)}
              disabled={savingId === item.id}
              className="mt-3 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)] disabled:opacity-60"
            >
              {savingId === item.id ? "Marcando..." : "Marcar como leído"}
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
