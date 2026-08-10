"use client";

import { useRouter } from "next/navigation";
import type { PeriodDays } from "./dashboard-overview-types";

const OPTIONS: { value: PeriodDays; label: string }[] = [
  { value: 7, label: "7 días" },
  { value: 30, label: "30 días" },
  { value: 90, label: "90 días" },
];

export default function PeriodFilter({ period }: { period: PeriodDays }) {
  const router = useRouter();

  return (
    <div className="inline-flex w-fit overflow-hidden rounded-[8px] border border-[#E8EAF0] bg-white text-xs font-semibold">
      {OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => router.push(`/dashboard?period=${opt.value}`)}
          className={`px-3 py-1.5 transition-colors ${
            i > 0 ? "border-l border-[#E8EAF0]" : ""
          } ${
            period === opt.value
              ? "bg-[#5C6BC0] text-white"
              : "bg-white text-[#8891A4] hover:bg-[#F5F6FA] hover:text-[#1A202C]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
