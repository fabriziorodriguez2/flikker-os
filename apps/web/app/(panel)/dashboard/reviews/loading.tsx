export default function ReviewsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 xl:max-w-7xl 2xl:max-w-[1600px]">
      <div className="space-y-3">
        <div className="h-3 w-28 animate-pulse rounded-full bg-[color:var(--surface-subtle)]" />
        <div className="h-12 w-72 animate-pulse rounded-[18px] bg-[color:var(--surface-subtle)]" />
        <div className="h-5 w-[32rem] max-w-full animate-pulse rounded-[14px] bg-[color:var(--surface-muted)]" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="h-72 animate-pulse rounded-[28px] bg-[color:var(--surface-subtle)]" />
        <div className="h-72 animate-pulse rounded-[28px] bg-[color:var(--surface)] border border-[color:var(--border)]" />
      </div>

      <div className="h-56 animate-pulse rounded-[28px] bg-[color:var(--surface)] border border-[color:var(--border)]" />

      <div className="grid gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-56 animate-pulse rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)]"
          />
        ))}
      </div>
    </div>
  );
}
