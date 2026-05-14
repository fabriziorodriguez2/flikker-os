"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ActivityGranularity = "day" | "week" | "month";

function toDateInput(value?: string) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default function ActivityFilters({
  granularity,
  from,
  to,
}: {
  granularity: ActivityGranularity;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [gran, setGran] = useState<ActivityGranularity>(granularity);
  const [fromVal, setFromVal] = useState(() => toDateInput(from));
  const [toVal, setToVal] = useState(() => toDateInput(to));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set("granularity", gran);
    if (fromVal) params.set("from", fromVal);
    if (toVal) params.set("to", toVal);
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
        Vista
        <select
          value={gran}
          onChange={(e) => setGran(e.target.value as ActivityGranularity)}
          className="h-9 rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#1A202C]"
        >
          <option value="day">Día</option>
          <option value="week">Semana</option>
          <option value="month">Mes</option>
        </select>
      </label>
      <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
        Desde
        <input
          type="date"
          value={fromVal}
          onChange={(e) => setFromVal(e.target.value)}
          className="h-9 rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#1A202C]"
        />
      </label>
      <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
        Hasta
        <input
          type="date"
          value={toVal}
          onChange={(e) => setToVal(e.target.value)}
          className="h-9 rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#1A202C]"
        />
      </label>
      <button
        type="submit"
        className="h-9 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
      >
        Aplicar
      </button>
    </form>
  );
}
