"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const RANGES = [
  { value: "last_30_days", label: "30 días" },
  { value: "last_90_days", label: "90 días" },
  { value: "all_time", label: "Todo" },
] as const;

type Range = (typeof RANGES)[number]["value"];

export default function ConversionRangeFilter({ range }: { range: Range }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setRange = useCallback(
    (value: Range) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("cvRange", value);
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex gap-1 rounded-[8px] border border-[#E8EAF0] bg-[#F5F6FA] p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => setRange(r.value)}
          className={`rounded-[6px] px-3 py-1.5 text-xs font-semibold transition-colors ${
            range === r.value
              ? "bg-white text-[#1A202C] shadow-sm"
              : "text-[#8891A4] hover:text-[#1A202C]"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
