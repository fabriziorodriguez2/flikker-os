function Bone({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[10px] bg-[#F0F2FA] ${className ?? ""}`} />
  );
}

export default function CustomersLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <Bone className="h-7 w-24" />
        <Bone className="h-9 w-32 rounded-[8px]" />
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Bone className="h-10 w-64 rounded-[8px]" />
        <Bone className="h-10 w-32 rounded-[8px]" />
        <Bone className="h-10 w-28 rounded-[8px]" />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[12px] border border-[#E8EAF0] bg-white">
        <div className="flex gap-4 bg-[#F5F6FA] px-5 py-3">
          <Bone className="h-3 w-32" />
          <Bone className="h-3 w-28" />
          <Bone className="h-3 w-20" />
          <Bone className="ml-auto h-3 w-20" />
        </div>
        <div className="divide-y divide-[#E8EAF0]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Bone className="h-4 w-36" />
              <Bone className="h-4 w-28" />
              <Bone className="h-4 w-16" />
              <Bone className="ml-auto h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
