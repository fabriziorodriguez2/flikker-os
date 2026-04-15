import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { apiFetch, isUnauthorizedApiError } from '@/lib/api';
import { redirect } from 'next/navigation';
import PageHeader from '@/components/ui/page-header';
import MetricCard from '@/components/ui/metric-card';
import SectionCard from '@/components/ui/section-card';

interface Business {
  id: string;
  name: string;
  slug: string;
  status: string;
  industry: string | null;
  email: string | null;
  phone: string | null;
}

interface MetricsOverview {
  range: {
    days: number;
    from: string;
    to: string;
  };
  reviews: {
    total: number;
    new: number;
    averageRating: number;
    responseRate: number;
    averageResponseTimeHours: number | null;
  };
  campaigns: {
    active: number;
    scans: number;
    clicks: number | null;
  };
  widgets: {
    total: number;
    active: number;
    impressions: number | null;
    clicks: number | null;
  };
}

interface DashboardPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseDays(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '30', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 30;
  return parsed;
}

function formatMetricDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatOptionalMetric(value: number | null, suffix = '') {
  if (value === null) return 'Pendiente';
  return `${value}${suffix}`;
}

function periodLink(days: number, active: boolean) {
  return `rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
    active
      ? 'border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white'
      : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]'
  }`;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect('/dashboard');

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const days = parseDays(firstValue(resolvedSearchParams.days));
  const { accessToken, activeBusinessId } = session;

  let business: Business | null = null;
  let metrics: MetricsOverview | null = null;
  let error: string | null = null;

  try {
    [business, metrics] = await Promise.all([
      apiFetch<Business>('/businesses/current', accessToken, {
        businessId: activeBusinessId,
      }),
      apiFetch<MetricsOverview>(`/metrics/overview?days=${days}`, accessToken, {
        businessId: activeBusinessId,
      }),
    ]);
  } catch (e) {
    if (isUnauthorizedApiError(e)) redirect('/session-expired');
    error = e instanceof Error ? e.message : 'Error al cargar datos';
  }

  if (error) {
    return (
      <div className="max-w-3xl">
        <PageHeader
          eyebrow="Inicio"
          title="Resumen"
          subtitle="No pudimos cargar el negocio activo."
        />
        <div
          className="mt-5 rounded-[20px] border px-4 py-3 text-sm text-[color:var(--danger-text)]"
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

  const currentRole = session.memberships.find(
    (m) => m.businessId === activeBusinessId,
  )?.role;
  const periodOptions = [7, 30, 90];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Inicio"
        title={business?.name ?? 'Flikker'}
        subtitle="Resumen del negocio activo."
        actions={
          <>
            {periodOptions.map((option) => {
              const isActive = option === days;

              return (
                <Link
                  key={option}
                  href={`/dashboard?days=${option}`}
                  className={periodLink(option, isActive)}
                >
                  {option}d
                </Link>
              );
            })}
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              {currentRole}
            </span>
          </>
        }
      />

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        <div className="flikker-card rounded-[20px] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                Período
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[color:var(--foreground)]">
                {metrics ? formatMetricDate(metrics.range.from) : '-'} al{' '}
                {metrics ? formatMetricDate(metrics.range.to) : '-'}
              </h2>
              <p className="mt-2 text-sm leading-5 text-[color:var(--text-muted)]">
                {business?.industry ?? 'Industria no definida'} ·{' '}
                {business?.status?.toLowerCase() ?? 'activo'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/campaigns"
                className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]"
              >
                Campañas
              </Link>
              <Link
                href="/dashboard/reviews"
                className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]"
              >
                Reseñas
              </Link>
              <Link
                href="/dashboard/widgets"
                className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]"
              >
                Widgets
              </Link>
            </div>
          </div>
        </div>

        <div className="flikker-card rounded-[20px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
            Negocio
          </p>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="font-medium text-[color:var(--foreground)]">Slug</p>
              <p className="mt-1 text-[color:var(--text-muted)]">{business?.slug}</p>
            </div>
            <div>
              <p className="font-medium text-[color:var(--foreground)]">Contacto</p>
              <p className="mt-1 text-[color:var(--text-muted)]">
                {business?.email ?? 'Sin email cargado'}
              </p>
              <p className="text-[color:var(--text-muted)]">
                {business?.phone ?? 'Sin teléfono cargado'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Reseñas"
          value={metrics?.reviews.total ?? 0}
          hint={`${metrics?.reviews.new ?? 0} nuevas`}
          tone="accent"
        />
        <MetricCard
          label="Rating"
          value={metrics?.reviews.averageRating.toFixed(1) ?? '0.0'}
          hint="Promedio"
        />
        <MetricCard
          label="Respuesta"
          value={`${metrics?.reviews.responseRate ?? 0}%`}
          hint="Tasa"
        />
        <MetricCard
          label="Tiempo"
          value={formatOptionalMetric(metrics?.reviews.averageResponseTimeHours ?? null, 'h')}
          hint="Promedio"
          tone="warm"
        />
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <SectionCard
          title="Campañas"
          description="Actividad del canal."
          action={
            <Link
              href="/dashboard/campaigns"
              className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]"
            >
              Ver
            </Link>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Activas"
              value={metrics?.campaigns.active ?? 0}
              hint="En curso"
            />
            <MetricCard
              label="Scans"
              value={metrics?.campaigns.scans ?? 0}
              hint="Período"
              tone="accent"
            />
            <MetricCard
              label="Clicks"
              value={formatOptionalMetric(metrics?.campaigns.clicks ?? null)}
              hint="Tracking"
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Widgets"
          description="Estado de publicación."
          action={
            <Link
              href="/dashboard/widgets"
              className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold text-[color:var(--text-muted)] hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]"
            >
              Ver
            </Link>
          }
          tone="tinted"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Creados" value={metrics?.widgets.total ?? 0} hint="Total" />
            <MetricCard
              label="Activos"
              value={metrics?.widgets.active ?? 0}
              hint="Listos"
              tone="accent"
            />
            <MetricCard
              label="Impresiones"
              value={formatOptionalMetric(metrics?.widgets.impressions ?? null)}
              hint="Tracking"
            />
            <MetricCard
              label="Clicks"
              value={formatOptionalMetric(metrics?.widgets.clicks ?? null)}
              hint="Tracking"
            />
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
