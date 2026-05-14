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

function formatRelativeDate(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  if (hours < 48) return "ayer";
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function Stars({ score }: { score: number }) {
  return (
    <span className="text-amber-400 tracking-tight" aria-label={`${score} de 5 estrellas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < score ? "★" : "☆"}</span>
      ))}
    </span>
  );
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
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF0FB] text-xs font-semibold text-[#5C6BC0]">
                {item.customerName.slice(0, 1).toUpperCase()}
              </span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="font-semibold text-[#1A202C]">{item.customerName}</p>
                <Stars score={item.score} />
                <p className="text-xs text-[#8891A4]">{formatRelativeDate(item.createdAt)}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#1A202C]">
              {item.comment?.trim() || "Sin comentario."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
