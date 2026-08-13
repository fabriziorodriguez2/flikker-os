"use client";

import { useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/page-header";
import { useIsCheckinV2 } from "../../experience-context";
import AutomationsTab from "./automations-tab";
import PromotionsTab from "./promotions-tab";
import HistoryTab from "./history-tab";

/**
 * Notificaciones.
 *
 * Reemplaza, de cara al dueño, todo el vocabulario de Retention V2:
 * experimentos, objetivos, variantes, segmentos y optimización desaparecen de
 * la pantalla. El motor sigue funcionando exactamente igual por debajo — esta
 * sección es una fachada, no una reimplementación.
 *
 * Dos ideas separadas a propósito, que no comparten lista:
 *  - Automáticas: Flikker decide cuándo corresponde, según el comportamiento
 *    del cliente.
 *  - Promociones: el dueño decide qué mandar y cuándo.
 *
 * LEGACY no entra: esos negocios no tienen Retention V2 y siguen usando
 * `/dashboard/campaigns`, que queda vivo hasta la limpieza final.
 */

const TABS = [
  { key: "automaticas", label: "Automáticas" },
  { key: "promociones", label: "Promociones" },
  { key: "historial", label: "Historial" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function NotificacionesPage() {
  const isCheckinV2 = useIsCheckinV2();
  const [tab, setTab] = useState<TabKey>("automaticas");

  if (!isCheckinV2) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Notificaciones"
          subtitle="Los mensajes que Flikker le envía a tus clientes."
        />
        <div className="rounded-[18px] border border-[#E8EAF0] bg-white px-6 py-12 text-center">
          <p className="font-display text-lg font-semibold text-[#202333]">
            Esta sección todavía no está disponible para tu negocio
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#7F879C]">
            Podés seguir enviando y gestionando tus campañas como hasta ahora.
          </p>
          <Link
            href="/dashboard/campaigns"
            className="mt-6 inline-flex h-11 items-center rounded-[11px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
          >
            Ir a Campañas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificaciones"
        subtitle="Flikker puede enviar mensajes automáticamente para ayudar a que tus clientes vuelvan."
      />

      <div
        role="tablist"
        aria-label="Secciones de notificaciones"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {TABS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={tab === option.key}
            onClick={() => setTab(option.key)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              tab === option.key
                ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#4A56A6]"
                : "border-[#E3E5F0] bg-white text-[#7F879C] hover:border-[#5C6BC0]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === "automaticas" ? <AutomationsTab /> : null}
      {tab === "promociones" ? <PromotionsTab /> : null}
      {tab === "historial" ? <HistoryTab /> : null}
    </div>
  );
}
