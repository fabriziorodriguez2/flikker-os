import { redirect } from 'next/navigation';
import { getEffectiveApiContext, getSession } from '@/lib/auth';
import { apiFetch, isUnauthorizedApiError } from '@/lib/api';
import PageHeader from '@/components/ui/page-header';
import ReviewFiltersBar from '@/components/reviews/review-filters-bar';
import ReviewsTable from '@/components/reviews/reviews-table';
import MetricCard from '@/components/ui/metric-card';
import type {
  ReviewCampaignSummary,
  ReviewFiltersState,
  ReviewsResponse,
} from '@/components/reviews/types';

interface CampaignOption {
  id: string;
  name: string;
  slug: string;
}

interface ReviewsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildFilters(
  params: Record<string, string | string[] | undefined>,
): ReviewFiltersState {
  const responded = firstValue(params.responded);
  const highlighted = firstValue(params.highlighted);
  const campaignId = firstValue(params.campaignId);
  const rating = firstValue(params.rating);

  return {
    ...(responded ? { responded } : {}),
    ...(highlighted ? { highlighted } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(rating ? { rating } : {}),
  };
}

function buildReviewsPath(filters: ReviewFiltersState) {
  const query = new URLSearchParams({ limit: '50', sortBy: 'reviewedAt' });

  if (filters.responded) query.set('responded', filters.responded);
  if (filters.highlighted) query.set('isHighlighted', filters.highlighted);
  if (filters.campaignId) query.set('campaignId', filters.campaignId);
  if (filters.rating) query.set('ratingMin', filters.rating);

  return `/reviews/google?${query.toString()}`;
}

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect('/dashboard');

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = buildFilters(resolvedSearchParams);
  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect('/dashboard');

  let reviews: ReviewsResponse['data'] = [];
  let total = 0;
  let campaigns: ReviewCampaignSummary[] = [];
  let error: string | null = null;

  try {
    const reviewsResponse = await apiFetch<ReviewsResponse>(
      buildReviewsPath(filters),
      accessToken,
      {
        businessId,
        cache: 'no-store',
      },
    );

    reviews = reviewsResponse.data;
    total = reviewsResponse.total;
  } catch (e) {
    if (isUnauthorizedApiError(e)) redirect('/session-expired');
    error = e instanceof Error ? e.message : 'Error al cargar reseñas';
  }

  try {
    const campaignOptions = await apiFetch<CampaignOption[]>(
      '/campaigns',
      accessToken,
      {
        businessId,
        cache: 'no-store',
      },
    );

    campaigns = campaignOptions.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
    }));
  } catch (e) {
    if (isUnauthorizedApiError(e)) redirect('/session-expired');
    campaigns = [];
  }

  const hasActiveFilters = Object.values(filters).some(Boolean);
  const respondedCount = reviews.filter((review) => Boolean(review.respondedAt)).length;
  const highlightedCount = reviews.filter((review) => review.isHighlighted).length;

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader
          eyebrow="Reseñas"
          title="Reseñas"
          subtitle="No pudimos cargar las reseñas del negocio activo."
        />
        <div
          className="mt-6 rounded-[24px] border px-5 py-4 text-sm text-[color:var(--danger-text)]"
          style={{
            backgroundColor: 'var(--danger-bg)',
            borderColor: 'rgba(161,45,58,0.16)',
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Reseñas"
        title="Reseñas"
        subtitle="Bandeja de reseñas detectadas en Google."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total" value={total} tone="accent" />
        <MetricCard label="Respondidas" value={respondedCount} />
        <MetricCard label="Destacadas" value={highlightedCount} />
        <MetricCard
          label="Con filtros"
          value={hasActiveFilters ? 'Sí' : 'No'}
          hint="Estado actual"
          tone="warm"
        />
      </section>

      <ReviewFiltersBar filters={filters} campaigns={campaigns} />

      {reviews.length === 0 ? (
        <div className="flikker-card rounded-[28px] px-6 py-10 text-center">
          <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
            {hasActiveFilters
              ? 'No hay reseñas para esos filtros'
              : 'Todavía no hay reseñas'}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[color:var(--text-muted)]">
            {hasActiveFilters
              ? 'Ajustá los filtros para volver a ver todas las reseñas.'
              : 'Cuando detectemos reseñas de Google, vas a verlas acá.'}
          </p>
        </div>
      ) : (
        <ReviewsTable reviews={reviews} readOnly />
      )}
    </div>
  );
}
