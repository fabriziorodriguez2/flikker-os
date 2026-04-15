import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicShell from '@/components/public/public-shell';
import WidgetPreview from '@/components/widgets/widget-preview';
import type { WidgetPreviewReview, WidgetType } from '@/components/widgets/types';
import { apiFetch } from '@/lib/api';

interface PublicWidgetPayload {
  widget: {
    type: WidgetType;
    title: string | null;
    showAuthorName: boolean;
    showDate: boolean;
    maxItems: number;
  };
  summary: {
    averageRating: number;
    totalReviews: number;
    businessName: string;
  };
  reviews: Array<{
    rating: number;
    content: string | null;
    authorDisplayName: string | null;
    reviewedAt: string | null;
  }>;
}

async function getPublicWidget(publicToken: string) {
  try {
    return await apiFetch<PublicWidgetPayload>(`/public/widgets/${publicToken}`, null, {
      cache: 'no-store',
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}): Promise<Metadata> {
  const { publicToken } = await params;
  const data = await getPublicWidget(publicToken);
  if (!data) return { title: 'Flikker widget' };

  return {
    title: `${data.summary.businessName} | Widget Flikker`,
    description: `Reseñas publicadas por ${data.summary.businessName}`,
  };
}

export default async function PublicWidgetPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const data = await getPublicWidget(publicToken);
  if (!data) notFound();

  const reviews: WidgetPreviewReview[] = data.reviews.map((review, index) => ({
    id: `public-${index}`,
    rating: review.rating,
    content: review.content,
    authorDisplayName: review.authorDisplayName,
    reviewedAt: review.reviewedAt,
  }));

  return (
    <PublicShell
      eyebrow="Widget público"
      title={data.summary.businessName}
      subtitle="Reseñas destacadas del negocio."
      footerNote="Flikker"
    >
      <div className="space-y-5 rounded-[28px] bg-[color:var(--surface)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
              {data.widget.type === 'BADGE' ? 'Badge' : 'Widget de reseñas'}
            </p>
            <p className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
              {data.widget.title?.trim() || 'Reseñas'}
            </p>
          </div>

          <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
              Rating medio
            </p>
            <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">
              {data.summary.averageRating.toFixed(1)}
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 md:p-5">
          <WidgetPreview
            type={data.widget.type}
            title={data.widget.title}
            showAuthorName={data.widget.showAuthorName}
            showDate={data.widget.showDate}
            averageRating={data.summary.averageRating}
            totalReviews={data.summary.totalReviews}
            reviews={reviews}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
          <span>{data.summary.totalReviews} reseñas visibles</span>
        </div>
      </div>
    </PublicShell>
  );
}
