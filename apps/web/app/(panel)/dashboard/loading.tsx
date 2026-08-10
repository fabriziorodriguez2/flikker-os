function Bone({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[10px] bg-[#F0F2FA] ${className ?? ""}`} />
  );
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 xl:max-w-7xl 2xl:max-w-[1600px]">
      {/* Header + selector de período */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Bone className="h-7 w-56" />
          <Bone className="h-4 w-64" />
        </div>
        <Bone className="h-8 w-40" />
      </div>

      {/* 4 cards principales */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 space-y-3">
            <Bone className="h-3 w-24" />
            <Bone className="h-8 w-16" />
            <Bone className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Rendimiento + Actividad reciente */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Bone className="h-[340px] w-full rounded-[16px]" />
        <Bone className="h-[340px] w-full rounded-[16px]" />
      </div>

      {/* Acciones rápidas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bone key={i} className="h-24 w-full rounded-[14px]" />
        ))}
      </div>

      {/* Próximos pasos + Retención */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Bone className="h-40 w-full rounded-[16px]" />
        <Bone className="h-40 w-full rounded-[16px]" />
      </div>
    </div>
  );
}
