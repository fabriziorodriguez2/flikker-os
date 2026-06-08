import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import { ApiError, apiFetch, isUnauthorizedApiError } from "@/lib/api";
import PageHeader from "@/components/ui/page-header";
import ReviewRowActions from "@/components/reviews/review-row-actions";
import ReviewResponseForm from "@/components/reviews/review-response-form";
import type { ReviewDetail, ReviewResponse } from "@/components/reviews/types";
import { FEATURES } from "@/src/config/features";

interface ReviewDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-UY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderStars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export default async function ReviewDetailPage({
  params,
}: ReviewDetailPageProps) {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");

  const { id } = await params;
  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/dashboard");

  let review: ReviewDetail;
  let response: ReviewResponse | null = null;
  let responseError: string | null = null;

  let reviewSessionExpired = false;
  let reviewNotFound = false;
  let reviewFetchError: string | null = null;

  try {
    review = await apiFetch<ReviewDetail>(
      `/reviews/${id}`,
      accessToken,
      {
        businessId,
        cache: "no-store",
      },
    );
  } catch (e) {
    if (isUnauthorizedApiError(e)) reviewSessionExpired = true;
    else if (e instanceof ApiError && e.status === 404) reviewNotFound = true;
    else reviewFetchError = e instanceof Error ? e.message : "No se pudo cargar la reseña";
  }

  if (reviewSessionExpired) redirect("/session-expired");
  if (reviewNotFound) notFound();

  if (reviewFetchError || !review!) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader
          eyebrow="Reseñas"
          title="Detalle de reseña"
          subtitle="No pudimos cargar la reseña seleccionada."
        />
        <div
          className="mt-6 rounded-[24px] border px-5 py-4 text-sm text-[color:var(--danger-text)]"
          style={{
            backgroundColor: "var(--danger-bg)",
            borderColor: "rgba(161,45,58,0.16)",
          }}
        >
          {reviewFetchError}
        </div>
      </div>
    );
  }

  if (FEATURES.MANUAL_RESPONSES) {
    let responseSessionExpired = false;
    try {
      response = await apiFetch<ReviewResponse>(
        `/reviews/${id}/response`,
        accessToken,
        {
          businessId,
          cache: "no-store",
        },
      );
    } catch (e) {
      if (isUnauthorizedApiError(e)) responseSessionExpired = true;
      else if (!(e instanceof ApiError && e.status === 404)) {
        responseError =
          e instanceof Error ? e.message : "No se pudo cargar la respuesta";
      }
    }
    if (responseSessionExpired) redirect("/session-expired");
  }

  const responderName = review.respondedBy
    ? [review.respondedBy.firstName, review.respondedBy.lastName]
        .filter(Boolean)
        .join(" ")
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="text-sm">
        <Link
          href="/dashboard/reviews"
          className="font-medium text-[color:var(--brand-accent)] hover:text-[color:var(--brand-primary)]"
        >
          Volver a reseñas
        </Link>
      </div>

      <PageHeader
        eyebrow="Detalle de reseña"
        title={review.authorDisplayName ?? "Autor no informado"}
        subtitle={
          FEATURES.MANUAL_RESPONSES
            ? "Contexto completo de la reseña, respuesta manual y elegibilidad para widget."
            : "Contexto completo de la reseña y elegibilidad para widget."
        }
        actions={
          <ReviewRowActions
            reviewId={review.id}
            isHighlighted={review.isHighlighted}
            isResponded={Boolean(review.respondedAt)}
          />
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <div className="rounded-[28px] bg-[linear-gradient(135deg,#000441_0%,#27207A_52%,#9188F5_100%)] px-6 py-6 text-white shadow-[0_24px_60px_rgba(0,4,65,0.24)] md:px-7">
          <p className="text-sm font-medium text-[color:rgba(250,171,75,0.95)]">
            {renderStars(review.rating)}
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            Reseña recibida
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/82">
            <span>{formatDate(review.reviewedAt)}</span>
            <span>{review.source}</span>
            {review.campaign ? <span>{review.campaign.name}</span> : null}
          </div>
          <p className="mt-6 whitespace-pre-wrap text-sm leading-8 text-white/88">
            {review.content?.trim() || "Sin texto cargado."}
          </p>
        </div>

        <div className="space-y-4">
          <div className="flikker-card rounded-[28px] p-5 md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
              Contexto
            </p>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="font-semibold text-[color:var(--foreground)]">
                  Campana
                </dt>
                <dd className="mt-1 text-[color:var(--text-muted)]">
                  {review.campaign?.name ?? "Sin campana"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[color:var(--foreground)]">
                  Estado
                </dt>
                <dd className="mt-1 text-[color:var(--text-muted)]">
                  {review.status === "NEW"
                    ? "Nueva"
                    : review.status === "REVIEWED"
                      ? "Revisada"
                      : review.status === "RESPONDED"
                        ? "Respondida"
                        : review.status === "ARCHIVED"
                          ? "Archivada"
                          : review.status}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[color:var(--foreground)]">
                  Destacada
                </dt>
                <dd className="mt-1 text-[color:var(--text-muted)]">
                  {review.isHighlighted
                    ? "Activa para widget"
                    : "Aún no destacada"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[color:var(--foreground)]">
                  Fuente
                </dt>
                <dd className="mt-1 text-[color:var(--text-muted)]">
                  {review.source}
                </dd>
              </div>
            </dl>
          </div>

          {FEATURES.MANUAL_RESPONSES ? (
            <div className="flikker-card rounded-[28px] p-5 md:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
                Estado de respuesta
              </p>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="font-semibold text-[color:var(--foreground)]">
                    Situacion
                  </dt>
                  <dd className="mt-1 text-[color:var(--text-muted)]">
                    {review.respondedAt ? "Respondida" : "Sin responder"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[color:var(--foreground)]">
                    Fecha
                  </dt>
                  <dd className="mt-1 text-[color:var(--text-muted)]">
                    {review.respondedAt ? formatDate(review.respondedAt) : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[color:var(--foreground)]">
                    Usuario
                  </dt>
                  <dd className="mt-1 text-[color:var(--text-muted)]">
                    {responderName || "-"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </section>

      {FEATURES.MANUAL_RESPONSES ? (
        <ReviewResponseForm
          reviewId={review.id}
          initialResponse={response}
          initialRespondedAt={review.respondedAt}
          initialResponderName={responderName}
          initialLoadError={responseError}
        />
      ) : null}
    </div>
  );
}
