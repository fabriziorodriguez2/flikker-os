import Link from "next/link";
import Script from "next/script";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

interface DemoBusiness {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

const VALID_MODES = ["toast", "carousel", "grid"] as const;
type DemoMode = (typeof VALID_MODES)[number];

async function getDemoBusiness() {
  const res = await fetch(`${API_URL}/public/widgets/demo-business`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return (await res.json()) as DemoBusiness;
}

export default async function DemoWidgetPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const mode = VALID_MODES.includes(params.mode as DemoMode)
    ? (params.mode as DemoMode)
    : "toast";
  const business = await getDemoBusiness();

  if (!business) {
    return (
      <main className="min-h-screen bg-[#F5F6FA] px-6 py-10 font-sans text-[#1A202C]">
        <div className="mx-auto max-w-2xl rounded-xl border border-[#E8EAF0] bg-white p-6">
          <h1 className="font-display text-2xl font-bold">Landing demo</h1>
          <p className="mt-2 text-sm text-[#8891A4]">
            Todavía no existe el negocio demo. Entrá al panel admin y abrí Test
            Lab para prepararlo.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F6FA] px-5 py-8 font-sans text-[#1A202C]">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-xl border border-[#E8EAF0] bg-white p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-[#0D1B2A]">
                {business.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={business.logoUrl}
                    alt={`Logo de ${business.name}`}
                    className="h-full w-full object-contain"
                  />
                ) : null}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8891A4]">
                  Landing de prueba
                </p>
                <h1 className="mt-1 font-display text-[28px] font-bold leading-tight">
                  {business.name}
                </h1>
              </div>
            </div>

            <nav className="flex flex-wrap gap-2">
              {VALID_MODES.map((item) => (
                <Link
                  key={item}
                  href={`/demo/widget-preview?mode=${item}`}
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold ${
                    mode === item
                      ? "border-[#5C6BC0] bg-[#5C6BC0] text-white"
                      : "border-[#E8EAF0] bg-white text-[#1A202C] hover:bg-[#F5F6FA]"
                  }`}
                >
                  {item === "carousel"
                    ? "Carrusel"
                    : item === "grid"
                      ? "Grid"
                      : "Toast"}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-xl border border-[#E8EAF0] bg-white p-6">
            <p className="text-sm font-semibold text-[#5C6BC0]">
              Clínica demo
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight">
              Atención clara, seguimiento simple y reseñas visibles.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#8891A4]">
              Esta página simula el sitio de un negocio real para mostrar cómo
              se ve el widget de prueba instalado con el snippet público de
              Flikker.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {["Ortodoncia", "Limpieza dental", "Control"].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-[#E8EAF0] bg-[#F5F6FA] p-4 text-sm font-semibold"
                >
                  {item}
                </div>
              ))}
            </div>
          </article>

          <aside className="rounded-xl border border-[#E8EAF0] bg-white p-6">
            <h2 className="text-base font-bold">Widget activo</h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              Modo seleccionado:{" "}
              <span className="font-semibold text-[#1A202C]">
                {mode === "carousel" ? "Carrusel" : mode === "grid" ? "Grid" : "Toast"}
              </span>
            </p>

            <div className="mt-5 min-h-[260px] rounded-xl border border-dashed border-[#D9DEE8] bg-[#F5F6FA] p-4">
              {mode === "toast" ? (
                <p className="text-sm text-[#8891A4]">
                  El toast aparece flotando abajo a la derecha.
                </p>
              ) : (
                <p className="mb-4 text-sm text-[#8891A4]">
                  El widget se renderiza debajo usando el script real.
                </p>
              )}
              {mode !== "toast" ? (
                <div
                  data-flikker-widget
                  data-business={business.id}
                  data-mode={mode}
                  data-min-stars="4"
                  data-color={business.primaryColor ?? "#5C6BC0"}
                  data-position="bottom_right"
                />
              ) : null}
              <Script
                id={`flikker-demo-widget-${mode}`}
                src="/widget.js"
                strategy="afterInteractive"
                data-business={business.id}
                data-mode={mode}
                data-min-stars="4"
                data-color={business.primaryColor ?? "#5C6BC0"}
                data-position="bottom_right"
              />
            </div>
          </aside>
        </section>

        <footer className="flex justify-center py-4 text-xs text-[#8891A4]">
          <PoweredByFlikker />
        </footer>
      </div>
    </main>
  );
}
