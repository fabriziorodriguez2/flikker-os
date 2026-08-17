"use client";

import { Clock } from "lucide-react";
import type { ProgramHistoryItem } from "./types";

/**
 * "Historial" — timeline de Programa. Solo eventos defendibles: cada línea
 * viene de `GET /loyalty-program/history`, que mezcla la bitácora mínima
 * (activar/desactivar sellos, cambiar config, autorizar/revocar reactivación,
 * crear/editar beneficio) con eventos que ya tenían fecha real en otro lado
 * (beneficio ofrecido/canjeado, tarjeta completada/canjeada). Nada se inventa
 * hacia atrás — lo que no se registró, no aparece.
 */
export default function ProgramHistoryTab({
  items,
}: {
  items: ProgramHistoryItem[];
}) {
  if (items.length === 0) {
    return (
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
          <Clock className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-display text-base font-bold text-[#1A202C]">
          Todavía no hay actividad
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[#8891A4]">
          En cuanto configures beneficios o sellos, o tus clientes empiecen a
          usarlos, vas a ver la actividad acá.
        </p>
      </section>
    );
  }

  const groups = groupByDay(items);

  return (
    <div className="space-y-6">
      {groups.map(([label, dayItems]) => (
        <section key={label}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            {label}
          </h3>
          <ul className="mt-3 space-y-3 border-l-2 border-[#EEF0FB] pl-4">
            {dayItems.map((item) => (
              <li key={item.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#5C6BC0]"
                />
                <p className="text-sm text-[#1A202C]">{item.message}</p>
                <p className="mt-0.5 text-xs text-[#8891A4]">
                  {formatTime(item.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Hoy";
  if (sameDay(date, yesterday)) return "Ayer";
  return date.toLocaleDateString("es-UY", { day: "2-digit", month: "short" });
}

function groupByDay(
  items: ProgramHistoryItem[],
): Array<[string, ProgramHistoryItem[]]> {
  const groups = new Map<string, ProgramHistoryItem[]>();
  for (const item of items) {
    const label = dayLabel(item.occurredAt);
    const bucket = groups.get(label) ?? [];
    bucket.push(item);
    groups.set(label, bucket);
  }
  return [...groups.entries()];
}
