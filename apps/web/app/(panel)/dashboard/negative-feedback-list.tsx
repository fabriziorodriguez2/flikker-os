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
      <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-4 text-sm text-[#8891A4]">
        No hay comentarios negativos registrados.
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#E8EAF0]">
      {feedback.map((item) => (
        <article
          key={item.id}
          className="flex flex-wrap items-start justify-between gap-4 py-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF0FB] text-xs font-semibold text-[#5C6BC0]">
                {item.customerName.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <p className="font-semibold text-[#1A202C]">
                  {item.customerName}
                </p>
                <p className="text-xs text-[#8891A4]">{formatDate(item.createdAt)}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#1A202C]">
              {item.comment?.trim() || "Sin comentario."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-[color:rgba(192,57,43,0.1)] px-2.5 py-1 text-xs font-semibold text-[#C0392B]">
              {item.score}/5
            </span>
            {item.acknowledgedByOwner ? (
              <span className="rounded-full bg-[color:rgba(99,153,34,0.12)] px-2.5 py-1 text-xs font-semibold text-[#639922]">
                Leído
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void acknowledge(item.id)}
                disabled={savingId === item.id}
                className="rounded-[8px] border border-[#E8EAF0] px-3 py-1.5 text-xs font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-60"
              >
                {savingId === item.id ? "Marcando..." : "Marcar como leído"}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
