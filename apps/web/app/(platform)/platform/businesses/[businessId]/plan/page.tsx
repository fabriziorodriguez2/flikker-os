import { redirect } from "next/navigation";
import Link from "next/link";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import PlanClient, { type BusinessPlanRow } from "./plan-client";

export default async function BusinessPlanPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.isPlatformAdmin) redirect("/dashboard");

  let current: BusinessPlanRow | null = null;
  let history: BusinessPlanRow[] = [];
  let error: string | null = null;

  try {
    [current, history] = await Promise.all([
      apiFetch<BusinessPlanRow | null>(
        `/platform/businesses/${businessId}/plans/current`,
        session.accessToken,
      ),
      apiFetch<BusinessPlanRow[]>(
        `/platform/businesses/${businessId}/plans`,
        session.accessToken,
      ),
    ]);
  } catch (e) {
    if (isUnauthorizedApiError(e)) redirect("/session-expired");
    error = e instanceof Error ? e.message : "Error al cargar el plan";
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/platform"
          className="text-sm font-medium text-[#5C6BC0] hover:underline"
        >
          ← Volver al panel admin
        </Link>
        <h1 className="mt-3 font-display text-2xl font-bold text-[#1A202C]">
          Gestión de plan
        </h1>
        <p className="mt-1 text-sm text-[#8891A4]">
          Asigná o cambiá el plan del negocio. Cada cambio queda registrado en el historial.
        </p>
      </div>

      {error ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </div>
      ) : (
        <PlanClient
          businessId={businessId}
          initialCurrent={current}
          initialHistory={history}
        />
      )}
    </div>
  );
}
