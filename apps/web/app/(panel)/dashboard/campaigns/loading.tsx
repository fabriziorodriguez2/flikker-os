function Bone({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[10px] bg-[#F0F2FA] ${className ?? ""}`} />
  );
}

export default function CampaignsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <Bone className="h-7 w-32" />
        <Bone className="h-9 w-36 rounded-[8px]" />
      </div>

      {/* Campaign cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Bone key={i} className="h-28 rounded-[12px]" />
        ))}
      </div>

      {/* Activity table */}
      <div className="overflow-hidden rounded-[12px] border border-[#E8EAF0] bg-white">
        <div className="px-5 py-5 space-y-1">
          <Bone className="h-5 w-36" />
          <Bone className="h-4 w-64" />
        </div>
        <div className="divide-y divide-[#E8EAF0]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Bone className="h-4 w-32" />
              <Bone className="h-4 w-40" />
              <Bone className="h-5 w-20 rounded-full" />
              <Bone className="ml-auto h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
