import { getEffectiveApiContext, getSession } from "@/lib/auth";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { redirect } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/page-header";
import MetricCard from "@/components/ui/metric-card";
import SectionCard from "@/components/ui/section-card";
import CampaignStatusBadge from "@/components/campaigns/campaign-status-badge";
import RepeatCampaignEditor from "@/components/campaigns/repeat-campaign-editor";
import { FEATURES } from "@/src/config/features";

interface Campaign {
  id: string;
  name: string;
  slug: string;
  status: string;
  channel: string;
  templateKind: string | null;
  triggerOffsetDays: number | null;
  messageBody: string | null;
  offerText: string | null;
  enableLanding: boolean;
  branch: { id: string; name: string } | null;
  _count: { executions?: number };
}

interface DeviceBreakdown {
  mobile: number;
  desktop: number;
  tablet: number;
  unknown: number;
}

interface DayStat {
  date: string;
  total: number;
  unique: number;
}

interface QrCodeStat {
  qrCodeId: string;
  label: string | null;
  slug: string;
  total: number;
  unique: number;
}

interface BranchStat {
  branchId: string;
  branchName: string;
  total: number;
  unique: number;
}

interface CampaignStats {
  totalScans: number;
  uniqueScans: number;
  byDevice: DeviceBreakdown;
  byDay: DayStat[];
  byQrCode: QrCodeStat[];
  byBranch: BranchStat[];
}

function formatChannel(value: string) {
  return value.replace(/_/g, " ");
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");

  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/dashboard");

  let campaign: Campaign | null = null;
  let stats: CampaignStats | null = null;
  let error: string | null = null;

  try {
    [campaign, stats] = await Promise.all([
      apiFetch<Campaign>(`/campaigns/${id}`, accessToken, {
        businessId,
      }),
      apiFetch<CampaignStats>(`/campaigns/${id}/stats`, accessToken, {
        businessId,
      }),
    ]);
  } catch (e) {
    if (isUnauthorizedApiError(e)) {
      redirect("/session-expired");
    }
    error = e instanceof Error ? e.message : "Error al cargar datos";
  }

  if (error || !campaign || !stats) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="text-sm">
          <Link
            href="/dashboard/campaigns"
            className="font-medium text-[color:var(--brand-accent)] hover:text-[color:var(--brand-primary)]"
          >
            Volver a campañas
          </Link>
        </div>
        <div
          className="mt-6 rounded-[24px] border px-5 py-4 text-sm text-[color:var(--danger-text)]"
          style={{
            backgroundColor: "var(--danger-bg)",
            borderColor: "rgba(161,45,58,0.16)",
          }}
        >
          {error ?? "Campaña no encontrada"}
        </div>
      </div>
    );
  }

  const deviceTotal =
    stats.byDevice.mobile +
    stats.byDevice.desktop +
    stats.byDevice.tablet +
    stats.byDevice.unknown;

  const uniqueRate =
    stats.totalScans > 0
      ? `${Math.round((stats.uniqueScans / stats.totalScans) * 100)}%`
      : "-";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="text-sm">
        <Link
          href="/dashboard/campaigns"
          className="font-medium text-[color:var(--brand-accent)] hover:text-[color:var(--brand-primary)]"
        >
          Volver a campañas
        </Link>
      </div>

      <PageHeader
        eyebrow="Campaña"
        title={campaign.name}
        subtitle="Estado, slug y métricas de uso."
        actions={<CampaignStatusBadge status={campaign.status} />}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-[28px] bg-[linear-gradient(135deg,#000441_0%,#27207A_52%,#9188F5_100%)] px-6 py-6 text-white shadow-[0_24px_60px_rgba(0,4,65,0.24)] md:px-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            Link trazable
          </p>
          <h2 className="mt-3 text-4xl font-semibold text-white">
            /r/{campaign.slug}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">
            {formatChannel(campaign.channel)}
            {campaign.templateKind
              ? ` · Repeat ${formatChannel(campaign.templateKind)}`
              : ""}
            {FEATURES.MULTI_LOCAL && campaign.branch
              ? ` · ${campaign.branch.name}`
              : ""}
            {campaign.enableLanding ? " · Landing activa" : ""}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-white/12 bg-white/10 px-4 py-4 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                Scans
              </div>
              <div className="mt-2 text-3xl font-semibold text-white">
                {stats.totalScans}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/12 bg-white/10 px-4 py-4 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                Únicos
              </div>
              <div className="mt-2 text-3xl font-semibold text-white">
                {stats.uniqueScans}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/12 bg-white/10 px-4 py-4 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                Tasa única
              </div>
              <div className="mt-2 text-3xl font-semibold text-white">
                {uniqueRate}
              </div>
            </div>
          </div>
        </div>

        <SectionCard title="Resumen" description="Uso general de la campaña.">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Días con datos"
              value={stats.byDay.length}
              hint="Actividad registrada"
            />
            {FEATURES.QR_ADVANCED ? (
              <MetricCard
                label="QR"
                value={stats.byQrCode.length}
                hint="Con uso"
                tone="accent"
              />
            ) : null}
            {FEATURES.MULTI_LOCAL ? (
              <MetricCard
                label="Sucursales"
                value={stats.byBranch.length}
                hint="Con scans"
                tone="warm"
              />
            ) : null}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Scans totales" value={stats.totalScans} />
        <MetricCard
          label="Scans únicos"
          value={stats.uniqueScans}
          tone="accent"
        />
        <MetricCard label="Tasa única" value={uniqueRate} />
        <MetricCard
          label="Días con datos"
          value={stats.byDay.length}
          tone="warm"
        />
      </section>

      {campaign.templateKind ? (
        <SectionCard
          title="Variables Repeat"
          description="Edita texto, dias de offset y oferta opcional."
        >
          <RepeatCampaignEditor
            campaignId={campaign.id}
            messageBody={campaign.messageBody ?? ""}
            triggerOffsetDays={campaign.triggerOffsetDays ?? 0}
            offerText={campaign.offerText ?? ""}
          />
        </SectionCard>
      ) : null}

      {deviceTotal > 0 ? (
        <SectionCard
          title="Dispositivos"
          description="Distribución por tipo de dispositivo."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Mobile" value={stats.byDevice.mobile} />
            <MetricCard label="Desktop" value={stats.byDevice.desktop} />
            <MetricCard label="Tablet" value={stats.byDevice.tablet} />
            <MetricCard label="Otro" value={stats.byDevice.unknown} />
          </div>
        </SectionCard>
      ) : null}

      {FEATURES.QR_ADVANCED && stats.byQrCode.length > 0 ? (
        <SectionCard title="Por QR" description="Uso por activo trazable.">
          <div className="grid gap-4 md:grid-cols-2">
            {stats.byQrCode.map((qr) => (
              <div
                key={qr.qrCodeId}
                className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-[color:var(--foreground)]">
                      {qr.label ?? qr.slug}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                      {qr.slug}
                    </p>
                  </div>
                  <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                    QR
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MetricCard label="Total" value={qr.total} />
                  <MetricCard label="Únicos" value={qr.unique} tone="accent" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {FEATURES.MULTI_LOCAL && stats.byBranch.length > 0 ? (
        <SectionCard
          title="Por sucursal"
          description="Actividad atribuida por sucursal."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {stats.byBranch.map((branch) => (
              <div
                key={branch.branchId}
                className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-5"
              >
                <p className="text-lg font-semibold text-[color:var(--foreground)]">
                  {branch.branchName}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MetricCard label="Total" value={branch.total} />
                  <MetricCard
                    label="Únicos"
                    value={branch.unique}
                    tone="accent"
                  />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {stats.byDay.length > 0 ? (
        <SectionCard
          title="Actividad por día"
          description="Serie simple de uso."
        >
          <div className="overflow-hidden rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)]">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_120px] gap-3 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)] px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
              <div>Fecha</div>
              <div className="text-right">Total</div>
              <div className="text-right">Únicos</div>
            </div>
            <div className="divide-y divide-[color:var(--border)]">
              {stats.byDay.map((day) => (
                <div
                  key={day.date}
                  className="grid grid-cols-[minmax(0,1fr)_120px_120px] gap-3 px-5 py-4 text-sm"
                >
                  <div className="text-[color:var(--foreground)]">
                    {day.date}
                  </div>
                  <div className="text-right font-semibold text-[color:var(--foreground)]">
                    {day.total}
                  </div>
                  <div className="text-right text-[color:var(--text-muted)]">
                    {day.unique}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
