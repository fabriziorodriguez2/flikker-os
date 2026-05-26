import Link from "next/link";
import { redirect } from "next/navigation";
import { apiFetch, isUnauthorizedApiError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import TestLabAdminActions from "./test-lab-admin-actions";

interface DemoBusiness {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoUrl: string | null;
  vertical: string | null;
  timezone: string;
  country: string;
}

interface DemoCampaign {
  id: string;
  name: string;
  slug: string;
  status: string;
  templateKind: string | null;
  _count: { executions: number };
}

interface DemoWidget {
  id: string;
  mode: string;
  status: string;
  minStars: number;
  maxReviewsShown: number;
  primaryColor: string | null;
  position: string | null;
  enabled: boolean;
}

interface DemoResponse {
  business: DemoBusiness;
  customerCount: number;
  reviewCount: number;
  campaigns: DemoCampaign[];
  activeCampaigns: number;
  widget: DemoWidget | null;
  isDemo: boolean;
  widgetLandingUrl: string;
  note: string;
}

export default async function PlatformTestLabPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.isPlatformAdmin) redirect("/dashboard");

  let demo: DemoResponse | null = null;
  let error: string | null = null;

  try {
    demo = await apiFetch<DemoResponse>(
      "/platform/test-lab/demo",
      session.accessToken,
      { cache: "no-store" },
    );
  } catch (err) {
    if (isUnauthorizedApiError(err)) redirect("/login?reason=session_expired");
    error =
      err instanceof Error ? err.message : "No pudimos preparar el negocio demo";
  }

  if (error || !demo) {
    return (
      <div className="rounded-xl border border-[#C0392B]/20 bg-[#C0392B]/10 p-5 text-sm text-[#C0392B]">
        {error ?? "No pudimos cargar el Test Lab."}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex rounded-full bg-[#EEF0FB] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#5C6BC0]">
            Modo demo
          </span>
          <h1 className="mt-3 font-display text-[28px] font-bold leading-tight text-[#1A202C]">
            Test Lab
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#8891A4]">
            Herramienta interna para probar campañas, WhatsApp y widgets con un
            negocio separado de clientes reales.
          </p>
        </div>

        <TestLabAdminActions
          businessId={demo.business.id}
          widgetLandingUrl={demo.widgetLandingUrl}
        />
      </section>

      <section className="rounded-xl border border-[#E8EAF0] bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1A202C]">
              {demo.business.name}
            </h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              /{demo.business.slug} · {demo.business.id}
            </p>
          </div>
          <span className="inline-flex w-fit rounded-full bg-[#EEF7E8] px-3 py-1 text-xs font-semibold text-[#639922]">
            usando negocio de prueba
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Clientes demo" value={demo.customerCount} />
          <Stat label="Reseñas demo" value={demo.reviewCount} />
          <Stat label="Campañas activas" value={demo.activeCampaigns} />
          <Stat label="Widget" value={demo.widget?.status ?? "sin widget"} />
          <Stat label="Zona horaria" value={demo.business.timezone} />
        </div>

        <p className="mt-4 rounded-lg bg-[#F5F6FA] px-4 py-3 text-sm text-[#8891A4]">
          {demo.note}
        </p>
      </section>

      <section className="rounded-xl border border-[#E8EAF0] bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1A202C]">
              Landing de prueba
            </h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              Abrila en reunión para mostrar el widget real con datos demo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["toast", "carousel", "grid"] as const).map((mode) => (
              <Link
                key={mode}
                href={`${demo.widgetLandingUrl}?mode=${mode}`}
                target="_blank"
                className="inline-flex h-9 items-center rounded-lg border border-[#E8EAF0] bg-white px-3 text-sm font-semibold capitalize text-[#1A202C] hover:bg-[#F5F6FA]"
              >
                {mode === "carousel" ? "Carrusel" : mode === "grid" ? "Grid" : "Toast"}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-[#E8EAF0] bg-[#F5F6FA] px-4 py-3">
      <p className="text-xs font-semibold text-[#8891A4]">{label}</p>
      <p className="mt-2 truncate text-lg font-bold text-[#1A202C]">{value}</p>
    </article>
  );
}
