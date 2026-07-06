export interface RatingData {
  current: number;
  rawAverage: number;
  total: number;
  goal: number;
  reviewsNeeded: number;
  fiveStarThisMonth: number;
}

function barColor(progress: number): string {
  if (progress >= 67) return "#1D9E75";
  if (progress >= 34) return "#FAAB4B";
  return "#9188F5";
}

function motivationalText(n: number, goal: number): string {
  const g = goal.toFixed(1);
  if (n <= 5) return `¡Muy cerca! Solo ${n} ${n === 1 ? "reseña" : "reseñas"} de 5 estrellas para llegar a ${g}`;
  if (n <= 15) return `${n} reseñas de 5 estrellas para llegar a ${g}`;
  return `Necesitás ${n} reseñas de 5 estrellas para llegar a ${g}. Seguí marcando clientes.`;
}

export function RatingProgressCard({ rating }: { rating: RatingData }) {
  if (rating.current >= 5.0) {
    return (
      <article className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
            Tu rating en Google
          </p>
          <span className="text-xl font-bold text-[#1A202C]">⭐ 5.0</span>
        </div>
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[#F0F2FA]">
          <div className="h-full w-full rounded-full bg-[#1D9E75]" />
        </div>
        <p className="mt-3 text-sm font-semibold text-[#1D9E75]">
          ⭐ Rating perfecto — ¡mantené el nivel!
        </p>
      </article>
    );
  }

  // Progress within the [current-0.1, goal] range, using raw average for precision
  const anterior = Math.round((rating.current - 0.1) * 10) / 10;
  const progress = Math.min(
    100,
    Math.max(0, ((rating.rawAverage - anterior) / (rating.goal - anterior)) * 100),
  );
  const color = barColor(progress);
  // Clamp marker position so the label stays fully visible
  const markerPct = Math.min(92, Math.max(8, progress));

  return (
    <article className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
          Tu rating en Google
        </p>
        <span className="text-xl font-bold text-[#1A202C]">
          ⭐ {rating.current.toFixed(1)}
        </span>
      </div>

      <div className="mt-4">
        {/* Bar */}
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#F0F2FA]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: color }}
          />
        </div>

        {/* Labels */}
        <div className="relative mt-1.5 h-5">
          <span className="absolute left-0 text-[11px] font-medium text-[#8891A4]">
            {anterior.toFixed(1)}
          </span>
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-[#5C6BC0]"
            style={{ left: `${markerPct}%` }}
          >
            ↑ Estás acá
          </span>
          <span className="absolute right-0 text-[11px] font-medium text-[#8891A4]">
            {rating.goal.toFixed(1)}
          </span>
        </div>

        {/* Motivational text */}
        <p className="mt-3 text-sm text-[#4A5568]">
          {motivationalText(rating.reviewsNeeded, rating.goal)}
        </p>

        {/* Mini stat */}
        {rating.fiveStarThisMonth > 0 && (
          <p className="mt-2 text-xs text-[#B0B8C9]">
            Este mes entraron {rating.fiveStarThisMonth}{" "}
            {rating.fiveStarThisMonth === 1 ? "reseña" : "reseñas"} de 5 estrellas
          </p>
        )}
      </div>
    </article>
  );
}
