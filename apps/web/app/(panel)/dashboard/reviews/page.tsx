import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MessageSquareText, Star, TrendingUp } from "lucide-react";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import ReviewsFilters from "./reviews-filters";
import ReviewsPaginator from "./reviews-paginator";
import ExpandableText from "./expandable-text";
import PageHeader from "@/components/ui/page-header";
import GoogleLogo from "@/components/icons/google-logo";

const PAGE_SIZE = 10;

interface GoogleReview {
  id: string;
  rating: number;
  authorDisplayName: string | null;
  reviewedAt: string;
  content: string | null;
  attributedMessageId: string | null;
}

interface ReviewsResponse {
  data: GoogleReview[];
  total: number;
}

interface GoogleStats {
  total: number;
  thisMonth: number;
  avgStars: number;
}

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : (v ?? "");
}

function periodToFrom(period: string): string | null {
  const now = new Date();
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  if (period === "3m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    return d.toISOString();
  }
  if (period === "6m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 6);
    return d.toISOString();
  }
  return null;
}

function buildReviewsPath(stars: string, period: string, search: string) {
  const q = new URLSearchParams({ limit: "100", sortBy: "reviewedAt" });
  if (stars) {
    q.set("ratingMin", stars);
    q.set("ratingMax", stars);
  }
  const from = periodToFrom(period);
  if (from) q.set("from", from);
  if (search) q.set("search", search);
  return `/reviews/google?${q.toString()}`;
}

function formatReviewDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "ayer";
  if (diffDays < 30) return `hace ${diffDays} d`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `hace ${diffMonths} mes${diffMonths > 1 ? "es" : ""}`;
  const diffYears = Math.floor(diffMonths / 12);
  return `hace ${diffYears} año${diffYears > 1 ? "s" : ""}`;
}

function StarRating({ value }: { value: number }) {
  return (
    <span className="text-sm text-amber-400">
      {Array.from({ length: 5 }, (_, i) => (i < value ? "★" : "☆")).join("")}
    </span>
  );
}

function ReviewerAvatar({ name }: { name: string | null }) {
  const initials = name
    ? name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "?";
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF0FB] text-xs font-bold text-[#5C6BC0]">
      {initials}
    </div>
  );
}

export default async function ReviewsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");

  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/dashboard");

  const resolved = searchParams ? await searchParams : {};
  const stars = firstValue(resolved.stars);
  const period = firstValue(resolved.period);
  const search = firstValue(resolved.search);
  const pageNum = Math.max(1, parseInt(firstValue(resolved.page) || "1", 10));

  let stats: GoogleStats = { total: 0, thisMonth: 0, avgStars: 0 };
  let reviews: GoogleReview[] = [];
  let error: string | null = null;

  let sessionExpired = false;
  try {
    [stats, { data: reviews }] = await Promise.all([
      apiFetch<GoogleStats>("/reviews/google/stats", accessToken, { businessId }),
      apiFetch<ReviewsResponse>(
        buildReviewsPath(stars, period, search),
        accessToken,
        { businessId },
      ),
    ]);
  } catch (e) {
    if (isUnauthorizedApiError(e)) sessionExpired = true;
    else error = e instanceof Error ? e.message : "Error al cargar reseñas";
  }
  if (sessionExpired) redirect("/session-expired");

  if (error) {
    return (
      <div className="rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-[#C0392B]">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 xl:max-w-7xl 2xl:max-w-[1600px]">
      <PageHeader
        title="Reseñas de Google"
        subtitle="Lo que tus clientes dicen de tu negocio."
        icon={<GoogleLogo className="h-7 w-7" />}
      />

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <article className="group relative overflow-hidden rounded-[16px] border border-[#5C6BC0]/20 bg-[linear-gradient(135deg,#F8F8FF_0%,#ECEEFC_100%)] p-5 shadow-[0_8px_24px_rgba(56,45,125,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(56,45,125,0.13)]">
          <span className="absolute -right-5 -top-6 flex h-20 w-20 items-end justify-start rounded-full bg-[#5C6BC0]/10 p-4 text-[#5C6BC0] transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6">
            <MessageSquareText className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="relative text-[11px] font-bold uppercase tracking-[0.1em] text-[#5C6BC0]">
            Total de Reseñas
          </p>
          <p className="relative mt-3 text-[34px] font-bold leading-none text-[#1A202C]">
            {stats.total}
          </p>
          <p className="relative mt-3 text-xs text-[#777F96]">Histórico detectado</p>
        </article>

        <article className="group relative overflow-hidden rounded-[16px] border border-[#F9A148]/30 bg-gradient-to-br from-[#FBB25A] to-[#F5842A] p-5 text-white shadow-[0_12px_30px_rgba(245,132,42,0.22)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(245,132,42,0.3)]">
          <Star className="absolute right-5 top-5 h-6 w-6 fill-white/20 text-white/75 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12" aria-hidden="true" />
          <p className="relative text-[11px] font-bold uppercase tracking-[0.1em] text-white/85">
            Calificación Promedio
          </p>
          <p className="relative mt-3 text-[34px] font-bold leading-none text-white">
            {stats.avgStars > 0 ? (
              <>
                {stats.avgStars.toFixed(1)}{" "}
                <span className="text-xl text-white/90">★</span>
              </>
            ) : (
              "—"
            )}
          </p>
          <p className="relative mt-3 text-xs text-white/80">Rating actual en Google</p>
        </article>

        <article className="group relative overflow-hidden rounded-[16px] border border-[#1D9E75]/18 bg-[linear-gradient(135deg,#F5FCF9_0%,#E8F7F1_100%)] p-5 shadow-[0_8px_24px_rgba(29,158,117,0.07)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(29,158,117,0.14)]">
          <span className="absolute -right-5 -top-6 flex h-20 w-20 items-end justify-start rounded-full bg-[#1D9E75]/10 p-4 text-[#178460] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
            <TrendingUp className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="relative text-[11px] font-bold uppercase tracking-[0.1em] text-[#178460]">
            Reseñas Este Mes
          </p>
          <p className="relative mt-3 text-[34px] font-bold leading-none text-[#1A202C]">
            {stats.thisMonth}
          </p>
          <p className="relative mt-3 text-xs text-[#66877C]">Nuevas este mes</p>
        </article>
      </div>

      {/* Filters */}
      <Suspense>
        <ReviewsFilters />
      </Suspense>

      {/* Table */}
      {(() => {
        const totalPages = Math.max(1, Math.ceil(reviews.length / PAGE_SIZE));
        const safePage = Math.min(pageNum, totalPages);
        const pagedReviews = reviews.slice(
          (safePage - 1) * PAGE_SIZE,
          safePage * PAGE_SIZE,
        );

        return (
          <section className="overflow-hidden rounded-[12px] border border-[#E8EAF0] bg-white">
            {reviews.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-[#8891A4]">
                {stars || period || search
                  ? "No hay reseñas para esos filtros."
                  : "Todavía no hay reseñas de Google detectadas."}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-[#F5F6FA] text-[11px] uppercase tracking-[0.08em] text-[#8891A4]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Reseñador</th>
                        <th className="px-4 py-3 font-semibold">Estrellas</th>
                        <th className="px-4 py-3 font-semibold">Comentario</th>
                        <th className="px-4 py-3 font-semibold">Fecha</th>
                        <th className="px-4 py-3 font-semibold">Atribuida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedReviews.map((review) => (
                        <tr
                          key={review.id}
                          className="border-t border-[#E8EAF0] hover:bg-[#FAFBFC]"
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <ReviewerAvatar name={review.authorDisplayName} />
                              <span className="font-semibold text-[#1A202C]">
                                {review.authorDisplayName ?? "Anónimo"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <StarRating value={review.rating} />
                          </td>
                          <td className="max-w-[320px] px-4 py-3.5">
                            {review.content?.trim() ? (
                              <ExpandableText text={review.content.trim()} />
                            ) : (
                              <span className="text-[#8891A4]">Sin comentario</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-[#8891A4]">
                            {formatReviewDate(review.reviewedAt)}
                          </td>
                          <td className="px-4 py-3.5">
                            {review.attributedMessageId ? (
                              <span className="rounded-full bg-[#EEF7E8] px-2.5 py-1 text-xs font-semibold text-[#639922]">
                                vía Flikker
                              </span>
                            ) : (
                              <span className="text-[#8891A4]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-[#E8EAF0]">
                  <Suspense>
                    <ReviewsPaginator
                      currentPage={safePage}
                      totalPages={totalPages}
                    />
                  </Suspense>
                </div>
              </>
            )}
          </section>
        );
      })()}
    </div>
  );
}
