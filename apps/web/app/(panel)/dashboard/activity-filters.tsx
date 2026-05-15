"use client";

import { useRouter } from "next/navigation";

export type ActivityGranularity = "day" | "week" | "month";

const OPTIONS: { value: ActivityGranularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

export default function ActivityFilters({
  granularity,
}: {
  granularity: ActivityGranularity;
}) {
  const router = useRouter();

  return (
    <div className="inline-flex w-fit overflow-hidden rounded-[8px] border border-[#E8EAF0] bg-white text-xs font-semibold">
      {OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => router.push(`/dashboard?granularity=${opt.value}`)}
          className={`px-3 py-1.5 transition-colors ${
            i > 0  "border-l border-[#E8EAF0]" : ""
          } ${
            granularity === opt.value
               "bg-[#5C6BC0] text-white"
              : "bg-white text-[#8891A4] hover:bg-[#F5F6FA] hover:text-[#1A202C]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
