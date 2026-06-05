function Bone({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[10px] bg-[#F0F2FA] ${className ?? ""}`} />
  );
}

export default function QrLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <Bone className="h-7 w-48" />
        <Bone className="h-4 w-80" />
      </div>

      {/* QR card */}
      <div className="rounded-xl border border-[#E8EAF0] bg-white p-4 text-center shadow-sm space-y-3">
        <Bone className="mx-auto h-3 w-32" />
        <Bone className="mx-auto h-56 w-56 rounded-xl" />
        <Bone className="mx-auto h-3 w-48" />
      </div>

      {/* Info banner */}
      <Bone className="h-14 rounded-xl" />

      {/* Buttons */}
      <div className="flex gap-3">
        <Bone className="h-10 w-36 rounded-xl" />
        <Bone className="h-10 w-40 rounded-xl" />
      </div>
    </div>
  );
}
