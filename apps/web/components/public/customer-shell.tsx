import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";
import BrandWordmark from "@/components/brand/brand-wordmark";
import { normalizeHex } from "@/lib/loyalty-card-theme";

/**
 * El marco de TODA la experiencia customer-facing de Check-in V2.
 *
 * Es el cambio de criterio de identidad: antes cada pantalla se pintaba
 * entera con el color del negocio (`buildPublicExperienceTheme` sobre
 * `Business.checkinBackgroundColor`), así que la misma app se veía naranja en
 * un local, bordo en otro y celeste en un tercero — no parecía un producto,
 * parecía una mini landing por local. Ahora manda Flikker: fondo, superficies,
 * tipografía, botones, foco y estados salen de una sola paleta, igual en
 * todos los negocios.
 *
 * El negocio no desaparece: queda CONTENIDO en su avatar, su nombre y — sobre
 * todo — en su tarjeta de sellos, que sigue siendo 100% configurable por él.
 * La regla es "Flikker primero, negocio después", no "sin negocio".
 *
 * ## Los tokens
 *
 * `--pub-*` son los tokens que ya consumen todos los componentes públicos
 * (`FeedbackForm`, `ChallengeRow`, `BenefitCard`, `PublicState`…). No cambian
 * de nombre a propósito: lo que cambia es de DÓNDE salen. Antes se derivaban
 * del fondo del negocio midiendo luminancia; ahora son constantes de Flikker,
 * así que el contraste es conocido y no depende de lo que el dueño eligió.
 *
 * `--biz-*` es la cuota del negocio, y es deliberadamente chica: el aro de su
 * avatar y el pulgar del sello deslizable. Todo lo demás que quiera color del
 * local viaja como prop explícita (`LoyaltyCard`, `BenefitCard.brand`).
 */
export default function CustomerShell({
  business,
  eyebrow = null,
  back,
  brand,
  fill = true,
  compact = false,
  showWordmark = false,
  footer = true,
  children,
}: {
  /** El negocio, cuando la pantalla pertenece a uno. */
  business?: { name: string; logoUrl?: string | null } | null;
  /**
   * La línea chica debajo del nombre del negocio. Sin default a propósito: en
   * el check-in y en el detalle de un lugar la pantalla ES la tarjeta, pero en
   * feedback o en un beneficio suelto no hay ninguna tarjeta que anunciar y
   * una etiqueta genérica ahí solo mentiría.
   */
  eyebrow?: string | null;
  back?: { href: string; label: string } | null;
  /** Color del negocio — solo alimenta `--biz-*`, nunca el fondo. */
  brand?: string | null;
  /** `false` llena el alto del contenedor (preview del panel) en vez del viewport. */
  fill?: boolean;
  compact?: boolean;
  /** Marca Flikker arriba: se usa donde el cliente todavía no sabe dónde está. */
  showWordmark?: boolean;
  footer?: boolean;
  children: React.ReactNode;
}) {
  const biz = normalizeHex(brand) ?? FLIKKER_ACCENT;

  return (
    <div
      className={`flk-customer flex w-full flex-col items-center ${
        fill ? "min-h-[100dvh]" : "h-full min-h-full"
      }`}
      style={
        {
          backgroundColor: TOKENS["--pub-bg"],
          color: TOKENS["--pub-text"],
          ...TOKENS,
          "--biz": biz,
          "--biz-soft": `color-mix(in srgb, ${biz} 12%, #FFFFFF)`,
        } as React.CSSProperties
      }
    >
      <div
        className={`flex w-full max-w-md flex-1 flex-col px-4 ${
          compact ? "py-5" : "py-7"
        }`}
      >
        {showWordmark ? (
          <div className="mb-6 flex justify-center">
            <BrandWordmark className="h-[26px] w-auto" />
          </div>
        ) : null}

        {back ? (
          <Link
            href={back.href}
            className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold"
            style={{
              backgroundColor: "var(--pub-surface)",
              borderColor: "var(--pub-surface-border)",
              color: "var(--pub-text-muted)",
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}

        {business ? (
          <BusinessHeader business={business} eyebrow={eyebrow} />
        ) : null}

        {children}
      </div>

      {footer ? (
        <div className="pb-5 pt-2">
          <PoweredByFlikker />
        </div>
      ) : null}
    </div>
  );
}

/**
 * El negocio, presente pero secundario: avatar con su color en el aro y el
 * nombre. Nada de un header teñido a pantalla completa — el cliente tiene que
 * saber en qué local está, no sentir que cambió de app.
 */
function BusinessHeader({
  business,
  eyebrow,
}: {
  business: { name: string; logoUrl?: string | null };
  eyebrow?: string | null;
}) {
  const initial = business.name.trim().slice(0, 1).toUpperCase() || "F";

  return (
    <div className="mb-5 flex items-center gap-3">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-white text-sm font-extrabold"
        style={{ borderColor: "var(--biz)", color: "var(--biz)" }}
      >
        {business.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={business.logoUrl}
            alt=""
            className="h-full w-full object-contain p-1"
          />
        ) : (
          initial
        )}
      </span>
      <div className="min-w-0">
        <p
          className="truncate text-[15px] font-extrabold leading-tight tracking-[-0.02em]"
          style={{ color: "var(--pub-text)" }}
        >
          {business.name}
        </p>
        {eyebrow ? (
          <p
            className="text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--pub-text-soft)" }}
          >
            {eyebrow}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const FLIKKER_ACCENT = "#5B5BD6";

/**
 * La paleta de Flikker para todo lo customer-facing. Clara, con mucho aire y
 * contraste alto: superficies blancas sobre un fondo apenas frío, una sola
 * familia tipográfica y un único acento para lo accionable.
 *
 * Son constantes a propósito. Cualquier pantalla nueva que consuma `--pub-*`
 * hereda esta base sin tener que decidir nada, y dos negocios distintos se
 * ven igual de sólidos.
 */
const TOKENS = {
  "--pub-bg": "#F4F5FA",
  "--pub-surface": "#FFFFFF",
  "--pub-surface-border": "#E7E8F1",
  "--pub-surface-muted": "#F7F8FC",
  "--pub-text": "#14151F",
  "--pub-text-muted": "#5A5F76",
  "--pub-text-soft": "#8A90A6",
  "--pub-accent": FLIKKER_ACCENT,
  "--pub-on-accent": "#FFFFFF",
} as const;
