import { getEffectiveApiContext, getSession } from "@/lib/auth";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { redirect } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import MetricCard from "@/components/ui/metric-card";
import CampaignCard from "@/components/campaigns/campaign-card";
import { FEATURES } from "@/src/config/features";

interface Campaign {
  id: string;
  name: string;
  slug: string;
  status: string;
  channel: string;
  templateKind: string | null;
  enableLanding: boolean;
  branch: { id: string; name: string } | null;
  _count: { qrCodes: number; scanEvents: number; executions?: number };
}

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");

  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) redirect("/dashboard");

  let campaigns: Campaign[] = [];
  let error: string | null = null;

  try {
    campaigns = await apiFetch<Campaign[]>("/campaigns", accessToken, {
      businessId,
    });
  } catch (e) {
    if (isUnauthorizedApiError(e)) redirect("/session-expired");
    error = e instanceof Error ? e.message : "Error al cargar campañas";
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader
          eyebrow="Campañas"
          title="Campañas"
          subtitle="No pudimos cargar las campañas del negocio activo."
        />
        <div
          className="mt-6 rounded-[24px] border px-5 py-4 text-sm text-[color:var(--danger-text)]"
          style={{
            backgroundColor: "var(--danger-bg)",
            borderColor: "rgba(161,45,58,0.16)",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  const activeCount = campaigns.filter(
    (campaign) => campaign.status === "ACTIVE",
  ).length;
  const totalScans = campaigns.reduce(
    (sum, campaign) => sum + campaign._count.scanEvents,
    0,
  );
  const totalQrs = campaigns.reduce(
    (sum, campaign) => sum + campaign._count.qrCodes,
    0,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Campañas"
        title="Campañas"
        subtitle={
          FEATURES.QR_ADVANCED
            ? "Links y QR del negocio activo."
            : "Links del negocio activo."
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="flikker-card rounded-[28px] p-6 md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
            Resumen
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[color:var(--foreground)]">
            Estado de campañas
          </h2>
          <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
            Cantidad, uso y estado de los activos trazables.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Campañas" value={campaigns.length} />
            <MetricCard label="Activas" value={activeCount} tone="accent" />
            <MetricCard label="Scans" value={totalScans} />
          </div>
        </div>

        <SectionCard
          title="Datos rápidos"
          description="Vista general del módulo."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {FEATURES.QR_ADVANCED ? (
              <MetricCard
                label="QR"
                value={totalQrs}
                hint="Activos vinculados"
                tone="accent"
              />
            ) : null}
            <MetricCard
              label="Scans"
              value={totalScans}
              hint="Eventos registrados"
            />
            <MetricCard
              label="Activas"
              value={activeCount}
              hint="Listas para usar"
              tone="warm"
            />
          </div>
        </SectionCard>
      </section>

      {campaigns.length === 0 ? (
        <div className="flikker-card rounded-[28px] px-6 py-10 text-center">
          <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
            Todavía no hay campañas
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[color:var(--text-muted)]">
            {FEATURES.QR_ADVANCED
              ? "Cuando crees links o QR, vas a verlos acá."
              : "Cuando crees links, vas a verlos acá."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
