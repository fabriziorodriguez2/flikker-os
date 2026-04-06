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
  _count: { qrCodes: number; scanEvents: number };
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  DRAFT: "bg-zinc-100 text-zinc-600",
  PAUSED: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  ARCHIVED: "bg-red-100 text-red-600",
};

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/dashboard");

  const { accessToken, activeBusinessId } = session;

  let campaigns: Campaign[] = [];
  let error: string | null = null;

  try {
    campaigns = await apiFetch<Campaign[]>("/campaigns", accessToken, {
      businessId: activeBusinessId,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Error al cargar campanas";
  }

  if (error) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-semibold text-zinc-900">Campanas</h1>
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Campanas</h1>
      <p className="text-sm text-zinc-500 mt-1">
        {campaigns.length} campana{campaigns.length !== 1 ? "s" : ""}
      </p>

      {campaigns.length === 0 ? (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-8 text-center">
          <p className="text-zinc-500">No hay campanas creadas.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">
                  Nombre
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">
                  Estado
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">
                  Canal
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">
                  Sucursal
                </th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">
                  QRs
                </th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">
                  Scans
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">{c.name}</div>
                    <div className="text-xs text-zinc-400">{c.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status] ?? "bg-zinc-100 text-zinc-600"}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {c.channel.replace(/_/g, " ")}
                    {c.enableLanding && (
                      <span className="ml-1 text-xs text-blue-500">
                        + landing
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {c.branch?.name ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-600">
                    {c._count.qrCodes}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-600">
                    {c._count.scanEvents}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/campaigns/${c.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver stats
                    </Link>
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
