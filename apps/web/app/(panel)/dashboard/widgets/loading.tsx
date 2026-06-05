function Bone({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[10px] bg-[#F0F2FA] ${className ?? ""}`} />
  );
}

export default function WidgetsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Bone className="h-7 w-20" />

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* Config card */}
        <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E8EAF0] pb-4">
            <div className="space-y-1.5">
              <Bone className="h-4 w-28" />
              <Bone className="h-3 w-44" />
            </div>
            <Bone className="h-6 w-11 rounded-full" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Bone className="h-3 w-20" />
              <Bone className="h-9 w-48 rounded-[8px]" />
            </div>
          ))}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Bone className="h-64 rounded-[12px]" />
          <Bone className="h-40 rounded-[12px]" />
        </div>
      </div>
    </div>
  );
}
