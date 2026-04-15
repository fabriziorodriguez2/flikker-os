import Link from "next/link";
import type { ReviewCampaignSummary, ReviewFiltersState } from "./types";

interface ReviewFiltersBarProps {
  filters: ReviewFiltersState;
  campaigns: ReviewCampaignSummary[];
}

export default function ReviewFiltersBar({
  filters,
  campaigns,
}: ReviewFiltersBarProps) {
  const inputClass =
    "flikker-input w-full px-4 py-3 text-sm";

  return (
    <form method="GET" className="flikker-card rounded-[28px] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
            Filtros
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
            Filtrar reseñas
          </h2>
        </div>

        <Link
          href="/dashboard/reviews"
          className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]"
        >
          Limpiar
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="responded"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]"
          >
            Respondida
          </label>
          <select
            id="responded"
            name="responded"
            defaultValue={filters.responded ?? ""}
            className={inputClass}
          >
            <option value="">Todas</option>
            <option value="true">Respondidas</option>
            <option value="false">Sin responder</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="highlighted"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]"
          >
            Destacada
          </label>
          <select
            id="highlighted"
            name="highlighted"
            defaultValue={filters.highlighted ?? ""}
            className={inputClass}
          >
            <option value="">Todas</option>
            <option value="true">Destacadas</option>
            <option value="false">No destacadas</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="campaignId"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]"
          >
            Campaña
          </label>
          <select
            id="campaignId"
            name="campaignId"
            defaultValue={filters.campaignId ?? ""}
            className={inputClass}
          >
            <option value="">Todas</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="rating"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]"
          >
            Rating mínimo
          </label>
          <select
            id="rating"
            name="rating"
            defaultValue={filters.rating ?? ""}
            className={inputClass}
          >
            <option value="">Todos</option>
            <option value="5">5 estrellas</option>
            <option value="4">4+ estrellas</option>
            <option value="3">3+ estrellas</option>
            <option value="2">2+ estrellas</option>
            <option value="1">1+ estrella</option>
          </select>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-[16px] bg-[color:var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)]"
        >
          Aplicar filtros
        </button>
      </div>
    </form>
  );
}
