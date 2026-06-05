function Bone({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[10px] bg-[#F0F2FA] ${className ?? ""}`} />
  );
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Title */}
      <div className="space-y-2">
        <Bone className="h-7 w-24" />
        <Bone className="h-4 w-48" />
      </div>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[12px] border border-[#E8EAF0] bg-white p-5 space-y-3"
          >
            <Bone className="h-3 w-28" />
            <Bone className="h-9 w-16" />
            <Bone className="h-5 w-36" />
          </div>
        ))}
      </section>

      {/* Flik panel */}
      <Bone className="h-48 w-full rounded-[12px]" />

      {/* QuickAttend */}
      <Bone className="h-32 w-full rounded-[12px]" />
    </div>
  );
}
