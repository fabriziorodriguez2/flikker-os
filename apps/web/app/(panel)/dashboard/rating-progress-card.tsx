export interface RatingData {
  current: number;
  rawAverage: number;
  total: number;
  goal: number;
  reviewsNeeded: number;
  fiveStarThisMonth: number;
}

export function RatingProgressCard({ rating }: { rating: RatingData }) {
  const perfect = rating.current >= 5.0;
  const needed = rating.reviewsNeeded;
  const closing = needed <= 15 ? "¡Estás cerca!" : "¡Vamos que se puede!";

  return (
    <article className="rounded-[16px] bg-gradient-to-br from-[#FBB25A] to-[#F5842A] p-6 text-white shadow-[0_12px_30px_rgba(245,132,42,0.28)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
        Tu rating en Google
      </p>

      <div className="mt-2 flex items-end gap-3">
        <span className="text-[52px] font-bold leading-none">
          {rating.current.toFixed(1)}
        </span>
        <span className="mb-1.5 text-lg tracking-tight text-white/90">
          ★★★★★
        </span>
      </div>

      <p className="mt-4 text-sm font-medium leading-relaxed text-white/95">
        {perfect ? (
          "Rating perfecto — ¡mantené el nivel! ⭐"
        ) : (
          <>
            Te faltan{" "}
            <span className="font-bold">
              {needed} {needed === 1 ? "reseña" : "reseñas"} de 5★
            </span>{" "}
            para llegar a {rating.goal.toFixed(1)}. {closing}
          </>
        )}
      </p>

      {!perfect && rating.fiveStarThisMonth > 0 && (
        <p className="mt-2 text-xs text-white/80">
          Este mes entraron {rating.fiveStarThisMonth}{" "}
          {rating.fiveStarThisMonth === 1 ? "reseña" : "reseñas"} de 5 estrellas
        </p>
      )}
    </article>
  );
}
