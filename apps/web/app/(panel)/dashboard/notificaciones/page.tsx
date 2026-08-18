"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Clock3, Info, Megaphone } from "lucide-react";
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
  { key: "automaticas", label: "Automáticas", icon: Bell },
  { key: "promociones", label: "Promociones", icon: Megaphone },
  { key: "historial", label: "Historial", icon: Clock3 },
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
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      <PageHeader
        title="Notificaciones"
        subtitle="Gestioná la comunicación con tus clientes desde Flikker."
      />

      <div className="flex items-start gap-3 rounded-[13px] border border-[#C9D7F6] bg-[#EEF4FF] px-4 py-3 text-sm leading-5 text-[#36539A]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-semibold">Canales disponibles:</span> las automatizaciones compatibles usan WhatsApp. Pro suma emails adicionales, Cumpleaños y promociones.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Secciones de notificaciones"
        className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-[12px] bg-[#ECEEF4] p-1"
      >
        {TABS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={tab === option.key}
              onClick={() => setTab(option.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-[9px] px-3.5 py-2 text-sm font-semibold transition-colors ${
                tab === option.key
                  ? "bg-white text-[#5C6BC0] shadow-[0_1px_4px_rgba(17,22,59,0.12)]"
                  : "text-[#7F879C] hover:bg-[#F5F3FF] hover:text-[#5C6BC0]"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>

      {tab === "automaticas" ? <AutomationsTab /> : null}
      {tab === "promociones" ? <PromotionsTab /> : null}
      {tab === "historial" ? <HistoryTab /> : null}
    </div>
  );
}
