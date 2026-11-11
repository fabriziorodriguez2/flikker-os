"use client";

import { useEffect, useState } from "react";

interface PolicySummary {
  accepted: boolean;
  paused: boolean;
  business: { currency: string };
  messageUnitCost: number | null;
  messageUnitCostCurrency: string | null;
}

/**
 * Costo estimado por mensaje del negocio. Lo carga Flikker porque el
 * proveedor actual de WhatsApp no informa precio; sin este valor, ningún
 * envío gobernado por la política del negocio puede salir.
 */
export default function MessageCostClient({ businessId }: { businessId: string }) {
  const [summary, setSummary] = useState<PolicySummary | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const base = `/api/proxy/platform/businesses/${businessId}/policy`;

  useEffect(() => {
    void fetch(base)
      .then((res) => (res.ok ? (res.json() as Promise<PolicySummary>) : null))
      .then((data) => {
        if (!data) return;
        setSummary(data);
        setValue(data.messageUnitCost === null ? "" : String(data.messageUnitCost));
      });
  }, [base]);

  async function save() {
    if (!summary) return;
    const trimmed = value.trim().replace(",", ".");
    const unitCost = trimmed === "" ? null : Number(trimmed);
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      setStatus("El costo tiene que ser un número mayor o igual a 0.");
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`${base}/message-cost`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitCost,
          currency: unitCost === null ? null : summary.business.currency,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? "No se pudo guardar");
      setStatus(unitCost === null ? "Costo borrado." : "Costo guardado.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!summary) return null;
  return (
    <section className="mt-6 rounded-[12px] border border-[#E8EAF0] bg-white p-5">
      <h2 className="text-sm font-semibold text-[#1A202C]">Costo por mensaje (política)</h2>
      <p className="mt-1 text-xs text-[#8891A4]">
        Política {summary.accepted ? "aceptada" : "sin aceptar"}
        {summary.paused ? " · PAUSADA" : ""}. Se usa para el presupuesto de mensajería del negocio.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-[#5F6780]">{summary.business.currency}</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Sin cargar"
          className="h-9 w-32 rounded-[8px] border border-[#E3E5F0] px-3 text-sm outline-none focus:border-[#5C6BC0]"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="h-9 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Guardar
        </button>
        {status ? <span className="text-xs text-[#5F6780]">{status}</span> : null}
      </div>
    </section>
  );
}
