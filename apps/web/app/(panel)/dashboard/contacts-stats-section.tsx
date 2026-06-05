"use client";

import { useQuery } from "@tanstack/react-query";
import SectionCard from "@/components/ui/section-card";

interface ContactsStats {
  total: number;
  byOrigin: {
    qr: number;
    manual: number;
    whatsapp: number;
  };
  newThisMonth: number;
}

const ORIGIN_CONFIG = [
  { key: "qr" as const, label: "QR", color: "#9188F5" },
  { key: "manual" as const, label: "Manual", color: "#FAAB4B" },
  { key: "whatsapp" as const, label: "WhatsApp", color: "#1D9E75" },
];

function Skeleton() {
  return (
    <SectionCard title="Tu base de contactos" description="Composición y crecimiento">
      <div className="animate-pulse space-y-4">
        <div className="flex items-baseline gap-3">
          <div className="h-10 w-24 rounded-[8px] bg-[#F0F2FA]" />
          <div className="h-4 w-48 rounded bg-[#F0F2FA]" />
        </div>
        <div className="space-y-3">
          {[80, 50, 30].map((w) => (
            <div key={w} className="flex items-center gap-3">
              <div className="h-4 w-20 rounded bg-[#F0F2FA]" />
              <div className="h-5 flex-1 rounded-full bg-[#F0F2FA]" />
              <div className="h-4 w-20 rounded bg-[#F0F2FA]" />
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

export default function ContactsStatsSection({
  businessId,
}: {
  businessId: string;
}) {
  const { data, isLoading, isError } = useQuery<ContactsStats>({
    queryKey: ["contacts-stats", businessId],
    queryFn: async () => {
      const res = await fetch("/api/proxy/contacts/stats");
      if (!res.ok) throw new Error("No se pudo cargar");
      return res.json() as Promise<ContactsStats>;
    },
  });

  if (isLoading) return <Skeleton />;
  if (isError || !data) return null;

  const { total, byOrigin, newThisMonth } = data;
  const rows = ORIGIN_CONFIG.filter((o) => byOrigin[o.key] > 0);

  return (
    <SectionCard
      title="Tu base de contactos"
      description="Composición y crecimiento"
    >
      <div className="space-y-5">
        {/* Total + growth */}
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-[40px] font-bold leading-none text-[#1A202C]">
            {total.toLocaleString("es-UY")}
          </span>
          <span className="text-sm text-[#8891A4]">
            {newThisMonth > 0
              ? `creciste ${newThisMonth.toLocaleString("es-UY")} este mes`
              : "sin nuevos contactos este mes"}
          </span>
        </div>

        {/* Empty state */}
        {total === 0 ? (
          <p className="text-sm text-[#8891A4]">
            Todavía no tenés contactos. Activá el QR o registrá tu primer
            cliente.
          </p>
        ) : rows.length > 0 ? (
          /* Horizontal bar chart */
          <div className="space-y-3">
            {rows.map((origin) => {
              const count = byOrigin[origin.key];
              const pct = Math.round((count / total) * 100);
              const barPct = Math.max(2, pct);
              return (
                <div key={origin.key} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-sm font-medium text-[#475467]">
                    {origin.label}
                  </span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-[#F0F2FA]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: origin.color,
                      }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm tabular-nums text-[#1A202C]">
                    {count.toLocaleString("es-UY")} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
