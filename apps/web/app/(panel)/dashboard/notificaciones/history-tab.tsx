"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock3 } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import RouteProgressBar from "@/components/ui/route-progress-bar";
import { MESSAGE_TYPE_LABEL, type MessageKind } from "@/lib/message-kind";
import { relativeDay, shortDate } from "../customers/loyalty-ui";

/**
 * Historial — todo lo que Flikker mandó, en una sola lista.
 *
 * Mezcla los mensajes automáticos (que salen de uno en uno, cuando el motor
 * decide) con las promociones (que salen a una audiencia, cuando el dueño
 * decide). Son dos modelos distintos por debajo y el dueño no tiene por qué
 * saberlo: lo que quiere es "qué se mandó y cómo salió".
 *
 * Los nombres de tipo salen de `@/lib/message-kind`, el mismo diccionario que
 * usa el detalle de un cliente. Nada de objective, experiment ni variant llega
 * hasta acá: el backend ya los tradujo.
 */

interface HistoryRow {
  id: string;
  at: string;
  kind: MessageKind;
  recipientCount: number;
  customer: { id: string; name: string } | null;
  benefitName: string | null;
  sent: number;
  failed: number;
  state: "enviado" | "en_progreso" | "fallo";
  message: string | null;
}

const STATE: Record<HistoryRow["state"], { label: string; className: string }> =
  {
    enviado: { label: "Enviado", className: "bg-[#EAF7EF] text-[#147A5B]" },
    en_progreso: {
      label: "En progreso",
      className: "bg-[#EEF0FB] text-[#4A56A6]",
    },
    fallo: { label: "Falló", className: "bg-[#FDECEA] text-[#C0392B]" },
  };

export default function HistoryTab() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/proxy/notifications/history");
      if (!res.ok) throw new Error("No pudimos cargar el historial.");
      setRows((await res.json()) as HistoryRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="space-y-3">
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="flk-glossy-secondary inline-flex h-10 items-center rounded-[10px] border border-[#E3E5F0] bg-white px-4 text-sm font-semibold text-[#202333] hover:border-[#5C6BC0]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (rows === null) {
    return <RouteProgressBar />;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Clock3}
        description="Los mensajes enviados por Flikker van a aparecer acá."
      />
    );
  }

  return (
    // Lista, no tabla: en el celular del dueño una tabla de seis columnas
    // termina en scroll horizontal.
    <ul className="divide-y divide-[#EFF1F7] overflow-hidden rounded-[16px] border border-[#E8EAF0] bg-white">
      {rows.map((row) => (
        <li key={row.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#202333]">
                  {MESSAGE_TYPE_LABEL[row.kind]}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE[row.state].className}`}
                >
                  {STATE[row.state].label}
                </span>
              </div>

              <p className="mt-1 text-xs text-[#8891A4]">
                {relativeDay(row.at)} · {shortDate(row.at)}
                {" · "}
                {/* Los automáticos son de a uno; las promociones, a una audiencia. */}
                {row.customer ? (
                  <Link
                    href={`/dashboard/customers/${row.customer.id}`}
                    className="font-semibold text-[#5C6BC0] hover:underline"
                  >
                    {row.customer.name}
                  </Link>
                ) : (
                  `${row.recipientCount} ${row.recipientCount === 1 ? "destinatario" : "destinatarios"}`
                )}
                {row.benefitName ? ` · ${row.benefitName}` : ""}
              </p>

              {row.message ? (
                <p className="mt-1.5 line-clamp-2 text-sm text-[#5F6780]">
                  {row.message}
                </p>
              ) : null}
            </div>

            {/* Solo se muestran los números que existen de verdad. */}
            {row.recipientCount > 1 ? (
              <div className="text-right">
                <p className="text-sm font-semibold text-[#202333]">
                  {row.sent} enviados
                </p>
                {row.failed > 0 ? (
                  <p className="mt-0.5 text-xs text-[#C0392B]">
                    {row.failed} fallidos
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
