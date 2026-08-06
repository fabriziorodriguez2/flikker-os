"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useCallback, useTransition } from "react";

const STAR_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "5", label: "★ 5" },
  { value: "4", label: "★ 4" },
  { value: "3", label: "★ 3" },
  { value: "2", label: "★ 2" },
  { value: "1", label: "★ 1" },
];

const PERIOD_OPTIONS = [
  { value: "", label: "Todo" },
  { value: "month", label: "Este mes" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
];

export default function ReviewsFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const stars = params.get("stars") ?? "";
  const period = params.get("period") ?? "";
  const search = params.get("search") ?? "";

  const push = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      startTransition(() => {
        router.push(`/dashboard/reviews?${next.toString()}`);
      });
    },
    [params, router],
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-white/75 bg-white/48 p-2.5 shadow-[0_8px_24px_rgba(56,45,125,0.06)] backdrop-blur-sm">
      {/* Stars filter */}
      <div className="inline-flex overflow-hidden rounded-[11px] border border-[#E8EAF0] bg-white text-xs font-semibold">
        {STAR_OPTIONS.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => push({ stars: opt.value })}
            className={`px-3 py-1.5 transition-colors ${i > 0 ? "border-l border-[#E8EAF0]" : ""} ${
              stars === opt.value
                ? "bg-[#5C6BC0] text-white"
                : "bg-white text-[#8891A4] hover:bg-[#F5F6FA]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Period filter */}
      <div className="inline-flex overflow-hidden rounded-[11px] border border-[#E8EAF0] bg-white text-xs font-semibold">
        {PERIOD_OPTIONS.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => push({ period: opt.value })}
            className={`px-3 py-1.5 transition-colors ${i > 0 ? "border-l border-[#E8EAF0]" : ""} ${
              period === opt.value
                ? "bg-[#5C6BC0] text-white"
                : "bg-white text-[#8891A4] hover:bg-[#F5F6FA]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8891A4]" />
        <input
          type="text"
          placeholder="Buscar por nombre..."
          defaultValue={search}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              push({ search: (e.target as HTMLInputElement).value });
            }
          }}
          onBlur={(e) => {
            if (e.target.value !== search) {
              push({ search: e.target.value });
            }
          }}
          className="w-full rounded-[11px] border border-[#E8EAF0] bg-white py-1.5 pl-8 pr-3 text-xs text-[#1A202C] placeholder-[#8891A4] outline-none focus:border-[#5C6BC0]"
        />
      </div>
    </div>
  );
}
