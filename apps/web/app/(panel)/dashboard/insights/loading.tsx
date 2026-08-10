function Bone({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[10px] bg-[#F0F2FA] ${className ?? ""}`} />
  );
}

export default function InsightsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 xl:max-w-7xl 2xl:max-w-[1600px]">
      {/* Title */}
      <div className="space-y-2">
        <Bone className="h-7 w-28" />
        <Bone className="h-4 w-72" />
      </div>

      {/* Activity chart card */}
      <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-5 space-y-4">
        <div className="space-y-1">
          <Bone className="h-5 w-24" />
          <Bone className="h-4 w-52" />
        </div>
        <Bone className="h-56 w-full rounded-[8px]" />
      </div>

      {/* Conversion + avg rating */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Bone className="h-48 rounded-[12px]" />
        <Bone className="h-48 rounded-[12px]" />
      </div>

      {/* Negative feedback */}
      <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-5 space-y-3">
        <div className="space-y-1">
          <Bone className="h-5 w-48" />
          <Bone className="h-4 w-80" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Bone key={i} className="h-20 rounded-[10px]" />
        ))}
      </div>
    </div>
  );
}
