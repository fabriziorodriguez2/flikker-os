import { getSession } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  slug: string;
  status: string;
  channel: string;
  enableLanding: boolean;
  branch: { id: string; name: string } | null;
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

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");

  const { accessToken, activeBusinessId } = session;

  let campaign: Campaign | null = null;
  let stats: CampaignStats | null = null;
  let error: string | null = null;

  try {
    [campaign, stats] = await Promise.all([
      apiFetch<Campaign>(`/campaigns/${id}`, accessToken, {
        businessId: activeBusinessId,
      }),
      apiFetch<CampaignStats>(`/campaigns/${id}/stats`, accessToken, {
        businessId: activeBusinessId,
      }),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Error al cargar datos";
  }

  if (error || !campaign || !stats) {
    return (
      <div className="max-w-4xl">
        <Link
          href="/dashboard/campaigns"
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Campanas
        </Link>
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            {error ?? "Campana no encontrada"}
          </p>
        </div>
      </div>
    );
  }

  const deviceTotal =
    stats.byDevice.mobile +
    stats.byDevice.desktop +
    stats.byDevice.tablet +
    stats.byDevice.unknown;

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/campaigns"
        className="text-sm text-blue-600 hover:underline"
      >
        &larr; Campanas
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {campaign.name}
        </h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-medium">
          {campaign.status}
        </span>
      </div>
      <p className="text-sm text-zinc-500 mt-1">
        {campaign.channel.replace(/_/g, " ")}
        {campaign.branch ? ` · ${campaign.branch.name}` : ""}
        {campaign.enableLanding ? " · Landing activa" : ""}
      </p>

      {/* Totals */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Scans totales" value={stats.totalScans} />
        <StatCard label="Scans unicos" value={stats.uniqueScans} />
        <StatCard
          label="Tasa unica"
          value={
            stats.totalScans > 0
              ? `${Math.round((stats.uniqueScans / stats.totalScans) * 100)}%`
              : "-"
          }
        />
        <StatCard label="Dias con datos" value={stats.byDay.length} />
      </div>

      {/* Device breakdown */}
      {deviceTotal > 0 && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-medium text-zinc-700 mb-3">
            Dispositivos
          </h2>
          <div className="grid grid-cols-4 gap-4 text-center">
            <DeviceStat
              label="Mobile"
              value={stats.byDevice.mobile}
              total={deviceTotal}
            />
            <DeviceStat
              label="Desktop"
              value={stats.byDevice.desktop}
              total={deviceTotal}
            />
            <DeviceStat
              label="Tablet"
              value={stats.byDevice.tablet}
              total={deviceTotal}
            />
            <DeviceStat
              label="Otro"
              value={stats.byDevice.unknown}
              total={deviceTotal}
            />
          </div>
        </div>
      )}

      {/* Daily series */}
      {stats.byDay.length > 0 && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-medium text-zinc-700 mb-3">
            Scans por dia (ultimos 30 dias)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-zinc-600">
                    Fecha
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-zinc-600">
                    Total
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-zinc-600">
                    Unicos
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {stats.byDay.map((d) => (
                  <tr key={d.date}>
                    <td className="px-3 py-2 text-zinc-600">{d.date}</td>
                    <td className="px-3 py-2 text-right text-zinc-900 font-medium">
                      {d.total}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600">
                      {d.unique}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* QR code breakdown */}
      {stats.byQrCode.length > 0 && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-medium text-zinc-700 mb-3">
            Rendimiento por QR
          </h2>
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-zinc-600">
                  QR
                </th>
                <th className="text-right px-3 py-2 font-medium text-zinc-600">
                  Total
                </th>
                <th className="text-right px-3 py-2 font-medium text-zinc-600">
                  Unicos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {stats.byQrCode.map((q) => (
                <tr key={q.qrCodeId}>
                  <td className="px-3 py-2">
                    <span className="text-zinc-900">{q.label ?? q.slug}</span>
                    <span className="ml-2 text-xs text-zinc-400">{q.slug}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-900 font-medium">
                    {q.total}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-600">
                    {q.unique}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Branch breakdown */}
      {stats.byBranch.length > 0 && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-medium text-zinc-700 mb-3">
            Rendimiento por sucursal
          </h2>
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-zinc-600">
                  Sucursal
                </th>
                <th className="text-right px-3 py-2 font-medium text-zinc-600">
                  Total
                </th>
                <th className="text-right px-3 py-2 font-medium text-zinc-600">
                  Unicos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {stats.byBranch.map((b) => (
                <tr key={b.branchId}>
                  <td className="px-3 py-2 text-zinc-900">{b.branchName}</td>
                  <td className="px-3 py-2 text-right text-zinc-900 font-medium">
                    {b.total}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-600">
                    {b.unique}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xl font-semibold text-zinc-900 mt-1">{value}</p>
    </div>
  );
}

function DeviceStat({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <p className="text-lg font-semibold text-zinc-900">{value}</p>
      <p className="text-xs text-zinc-500">
        {label} ({pct}%)
      </p>
    </div>
  );
}
