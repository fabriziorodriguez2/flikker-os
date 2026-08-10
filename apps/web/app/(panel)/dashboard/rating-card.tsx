import type { DashboardRating } from "./dashboard-overview-types";
import { n } from "./dashboard-format";

function Stars({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <span className="text-lg tracking-tight text-[#FAAB4B]" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (i < rounded ? "★" : "☆")).join("")}
    </span>
  );
}

export default function RatingCard({ rating }: { rating: DashboardRating }) {
  if (rating.current === null) {
    return (
      <article className="flex flex-col rounded-[16px] border border-[#E8EAF0] bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
          Calificación promedio
        </p>
        <p className="mt-4 text-sm text-[#8891A4]">
          Todavía no tenés reseñas de Google. En cuanto lleguen las primeras,
          vas a ver tu calificación acá.
        </p>
      </article>
    );
  }

  // La variación se mide en estrellas (rating.ratingDelta), no en cantidad de
  // reseñas — eso último ya se muestra por separado abajo, sin comparación.
  const deltaClass =
    rating.ratingDelta === null || rating.ratingDelta === 0
      ? "text-[#8891A4]"
      : rating.ratingDelta > 0
        ? "text-[#639922]"
        : "text-[#C0392B]";

  return (
    <article className="flex flex-col rounded-[16px] border border-[#E8EAF0] bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
        Calificación promedio
      </p>
      <div className="mt-3 flex items-end gap-3">
        <span className="text-[32px] font-bold leading-none text-[#1A202C]">
          {rating.current.toLocaleString("es-UY", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
        </span>
        <Stars value={rating.current} />
      </div>
      <p className={`mt-2 text-xs font-semibold ${deltaClass}`}>
        {rating.ratingDelta !== null
          ? rating.ratingDelta === 0
            ? "Igual que el período anterior"
            : `${rating.ratingDelta > 0 ? "↑" : "↓"} ${Math.abs(rating.ratingDelta).toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} vs. período anterior`
          : "Sin datos del período anterior"}
      </p>
      <p className="mt-3 text-xs text-[#8891A4]">
        {n(rating.totalReviews)} reseñas en total · {n(rating.newInPeriod)} nuevas
        en el período
      </p>
    </article>
  );
}
