/**
 * Estado de error explícito para cuando `/businesses/current` falla por un
 * motivo que no es sesión vencida (usado en `(panel)/layout.tsx` y
 * `dashboard/page.tsx` — los dos puntos que resuelven `experienceVersion`
 * de forma independiente). Server-safe a propósito (sin "use client"): un
 * link plano al mismo panel alcanza para reintentar con un request nuevo,
 * sin necesitar un client component solo para esto.
 *
 * Nunca reemplazar por "asumir LEGACY" — eso fue la causa real de un bug:
 * un 500 transitorio en `/businesses/current` hacía caer el panel de un
 * negocio CHECKIN_V2 a la experiencia LEGACY en silencio.
 */
export default function BusinessLoadError({
  retryHref = "/dashboard",
}: {
  retryHref?: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[16px] border border-[#E8EAF0] bg-white p-6 text-center shadow-[0_10px_30px_rgba(12,16,30,0.08)]">
        <h1 className="text-base font-bold text-[#1A202C]">
          No pudimos cargar tu negocio
        </h1>
        <p className="mt-2 text-sm text-[#8891A4]">
          Hubo un problema al conectar con el servidor. Probá de nuevo en
          unos segundos.
        </p>
        <a
          href={retryHref}
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-[#5C6BC0] text-sm font-semibold text-white hover:bg-[#4f5eb0]"
        >
          Reintentar
        </a>
      </div>
    </div>
  );
}
