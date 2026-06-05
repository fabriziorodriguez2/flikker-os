"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

interface ConversionFunnel {
  steps: FunnelStep[];
  topDropOffStep: { step: string; ratio: number } | null;
}

const ORIGINS = [
  { key: "qr", label: "QR", color: "#9188F5" },
  { key: "manual", label: "Manual", color: "#FAAB4B" },
  { key: "whatsapp", label: "WhatsApp", color: "#1D9E75" },
];

const MIN_MESSAGES = 5;

function conversionRate(funnel: ConversionFunnel | undefined): number | null {
  if (!funnel) return null;
  const sent = funnel.steps.find((s) => s.key === "sent")?.count ?? 0;
  const reviewed =
    funnel.steps.find((s) => s.key === "review_detected")?.count ?? 0;
  if (sent === 0) return null;
  return Math.round((reviewed / sent) * 1000) / 10;
}

function FunnelBars({ funnel }: { funnel: ConversionFunnel }) {
  const maxCount = funnel.steps[0]?.count ?? 1;
  return (
    <div className="space-y-2">
      {funnel.steps.map((step) => {
        const pct =
          maxCount > 0 ? Math.max(2, Math.round((step.count / maxCount) * 100)) : 0;
        const isNeg = step.key === "negative_feedback_filtered";
        const isReview = step.key === "review_detected";
        const barColor = isNeg
          ? "bg-[#FECACA]"
          : isReview
            ? "bg-[#5C6BC0]"
            : "bg-[#CBD5FF]";
        const labelColor = isNeg ? "text-[#C0392B]" : "text-[#4A5568]";
        return (
          <div key={step.key} className="flex items-center gap-3">
            <p className={`w-[160px] shrink-0 text-sm ${labelColor}`}>
              {step.label}
            </p>
            <div className="flex flex-1 items-center gap-2">
              <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-[#F0F2FA]">
                {step.count > 0 && (
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
              <span className="w-14 text-right text-sm font-semibold tabular-nums text-[#1A202C]">
                {step.count.toLocaleString("es-UY")}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SkeletonBars() {
  return (
    <div className="animate-pulse space-y-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-4 w-40 rounded bg-[#F0F2FA]" />
          <div className="h-5 flex-1 rounded-full bg-[#F0F2FA]" />
          <div className="h-4 w-14 rounded bg-[#F0F2FA]" />
        </div>
      ))}
    </div>
  );
}

export default function ConversionByOriginSection({
  businessId,
}: {
  businessId: string;
}) {
  const [origin, setOrigin] = useState("qr");
  const activeOrigin = ORIGINS.find((o) => o.key === origin) ?? ORIGINS[0]!;

  const { data: generalFunnel } = useQuery<ConversionFunnel>({
    queryKey: ["funnel-general", businessId],
    queryFn: async () => {
      const res = await fetch(
        "/api/proxy/metrics/conversion/funnel?attribution_window_days=7",
      );
      if (!res.ok) throw new Error();
      return res.json() as Promise<ConversionFunnel>;
    },
  });

  const { data: originFunnel, isLoading } = useQuery<ConversionFunnel>({
    queryKey: ["conversion-by-origin", businessId, origin],
    queryFn: async () => {
      const res = await fetch(
        `/api/proxy/metrics/conversion/funnel?attribution_window_days=7&origin=${origin}`,
      );
      if (!res.ok) throw new Error();
      return res.json() as Promise<ConversionFunnel>;
    },
  });

  const generalRate = conversionRate(generalFunnel);
  const originRate = conversionRate(originFunnel);
  const originSent = originFunnel?.steps.find((s) => s.key === "sent")?.count ?? 0;

  const fmt = (n: number) =>
    n.toLocaleString("es-UY", { maximumFractionDigits: 1 });

  return (
    <div className="mt-6 border-t border-[#E8EAF0] pt-5 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
          Conversión por origen del contacto
        </p>
        <p className="mt-1 text-sm text-[#475467]">
          ¿Los clientes que entraron por QR dejan más reseñas que los
          registrados manualmente?
        </p>
      </div>

      {/* Origin tabs */}
      <div className="inline-flex overflow-hidden rounded-[8px] border border-[#E8EAF0] text-xs font-semibold">
        {ORIGINS.map((o, i) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setOrigin(o.key)}
            className={`px-3 py-2 transition-colors ${i > 0 ? "border-l border-[#E8EAF0]" : ""} ${
              origin === o.key
                ? "text-white"
                : "bg-white text-[#8891A4] hover:bg-[#F5F6FA]"
            }`}
            style={origin === o.key ? { backgroundColor: o.color } : undefined}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <SkeletonBars />
      ) : originSent < MIN_MESSAGES ? (
        <div className="space-y-2">
          <p className="text-sm text-[#8891A4]">
            Todavía no hay suficientes datos para este origen. Necesitás al
            menos {MIN_MESSAGES} mensajes enviados a contactos de{" "}
            <span className="font-semibold text-[#1A202C]">
              {activeOrigin.label}
            </span>
            .
          </p>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F2FA]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (originSent / MIN_MESSAGES) * 100)}%`,
                  backgroundColor: activeOrigin.color,
                }}
              />
            </div>
            <span className="text-xs tabular-nums text-[#8891A4]">
              {originSent} / {MIN_MESSAGES}
            </span>
          </div>
        </div>
      ) : originFunnel ? (
        <div className="space-y-3">
          <FunnelBars funnel={originFunnel} />

          {/* Rate + comparison */}
          {originRate !== null && (
            <div className="border-t border-[#E8EAF0] pt-3 space-y-1">
              <p className="text-sm font-semibold text-[#1A202C]">
                Tasa de conversión {activeOrigin.label}: {fmt(originRate)}%
              </p>
              {generalRate !== null && (
                <p className="text-sm text-[#8891A4]">
                  vs. tasa general: {fmt(generalRate)}%{" "}
                  {originRate > generalRate ? (
                    <span className="font-semibold text-[#639922]">
                      ({fmt(originRate - generalRate)}% mejor que el promedio)
                    </span>
                  ) : originRate < generalRate ? (
                    <span className="font-semibold text-[#D4600A]">
                      ({fmt(generalRate - originRate)}% por debajo del promedio)
                    </span>
                  ) : (
                    <span>(igual al promedio)</span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
