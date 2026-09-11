"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Gift, Loader2, MapPin, QrCode } from "lucide-react";
import { useLogoPalette } from "@/lib/use-logo-palette";
import PublicState from "@/components/public/public-state";
import CustomerShell from "@/components/public/customer-shell";
import BottomNav, { type MiFlikkerTab } from "@/components/public/bottom-nav";
import PhoneInput, { isValidNationalPhone } from "@/components/ui/phone-input";
import OtpInput from "@/components/ui/otp-input";
import ChallengesTab, {
  type MyFlikkerChallenge,
} from "./challenges-tab";
import RewardsTab, { type MyFlikkerReward } from "./rewards-tab";
import AccountTab from "./account-tab";

/** `?tab=` → pestaña. Cualquier valor raro cae en Lugares. */
function asTab(raw: string | null): MiFlikkerTab {
  return raw === "desafios" || raw === "premios" || raw === "cuenta"
    ? raw
    : "lugares";
}

export interface MyFlikkerPlace {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  loyaltyCardColor: string | null;
  loyaltyCardTextColor: string | null;
  loyaltyCardBackgroundImage: string | null;
  loyaltyStampAreaColor: string | null;
  loyaltyStampColor: string | null;
  loyaltyStampIcon: string | null;
  loyaltyShowBusinessName: boolean;
  loyaltyStampBackgroundPattern: string | null;
  loyaltyStampBackgroundOpacity: number | null;
  visitsTotal: number;
  lastVisitAt: string | null;
  rewardGoal: {
    incentiveName: string;
    progressVisits: number;
    visitProgress?: number;
    bonusStamps?: number;
    targetAdditionalVisits: number;
    remainingVisits: number;
  } | null;
  benefitAvailable: {
    name: string;
    code: string;
    expiresAt: string | null;
  } | null;
  /**
   * Otras emisiones sin canjear (promo manual, bienvenida, reactivación).
   * El endpoint de la lista ya las devuelve — `placeSummary` es el mismo para
   * lista y detalle — así que el resumen puede contar TODOS los premios que
   * el cliente tiene disponibles ahí, no solo el de la tarjeta.
   */
  otherBenefits?: { title: string; code: string }[];
}

function MiFlikkerTitle() {
  return (
    <h1
      className="flex items-center justify-center gap-2.5"
      aria-label="Mi Flikker"
    >
      <span className="text-[24px] font-bold tracking-[-0.04em] text-[#171A2B]">
        MI
      </span>
      <Image
        src="/flikker-wordmark.svg"
        alt="Flikker"
        width={920}
        height={290}
        className="h-[34px] w-auto"
      />
    </h1>
  );
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as Record<string, unknown> };
}

/** El subtítulo de cada pestaña — dice qué estoy mirando, no qué es Flikker. */
const TAB_SUBTITLES: Record<MiFlikkerTab, string> = {
  lugares: "Todas tus recompensas Flikker en un solo lugar.",
  desafios: "Lo que tenés en curso en tus locales.",
  premios: "Tus beneficios, de todos tus lugares.",
  cuenta: "Con qué número estás identificado.",
};

export default function MiFlikkerClient({
  hasSession,
}: {
  hasSession: boolean;
}) {
  const params = useSearchParams();
  const view = asTab(params.get("tab"));
  const [status, setStatus] = useState<"loading" | "verify" | "places">(
    hasSession ? "loading" : "verify",
  );
  const [places, setPlaces] = useState<MyFlikkerPlace[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<MyFlikkerChallenge[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [challengesLoaded, setChallengesLoaded] = useState(false);
  const [rewards, setRewards] = useState<MyFlikkerReward[]>([]);
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [rewardsLoaded, setRewardsLoaded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!hasSession) return;
    void load();
  }, [hasSession]);

  /*
    La pestaña activa vive en la URL (`?tab=`), no en estado: el bottom nav
    también se dibuja en el detalle de un lugar, que es otra ruta, y desde
    ahí tocar "Premios" tiene que llevar a Premios. Ver `BottomNav`.
  */
  useEffect(() => {
    if (view === "desafios") void loadChallenges();
    if (view === "premios") void loadRewards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  /*
    El badge de Premios necesita saber cuántos hay disponibles antes de que
    el cliente abra esa pestaña, así que la lista se pide también al entrar
    — una sola vez, igual que los desafíos. Es una consulta por cuenta, no
    por negocio, así que es barata; y sin polling: se refresca al navegar.
  */
  useEffect(() => {
    if (status === "places") void loadRewards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /*
    Acá vivía el efecto que manejaba la billetera apilada: medía cada card
    contra una línea de foco, elegía la "activa" y les escribía scale/offset
    en cada scroll. Se fue junto con el deck — Lugares ahora es una lista
    vertical común, sin solapamiento, y no necesita ningún listener de scroll.
  */

  async function load() {
    setStatus("loading");
    try {
      const res = await fetch("/api/mi-flikker/places");
      if (res.status === 401) {
        setStatus("verify");
        return;
      }
      if (!res.ok) throw new Error();
      setPlaces((await res.json()) as MyFlikkerPlace[]);
      setStatus("places");
    } catch {
      setLoadError("No pudimos cargar tus lugares. Probá de nuevo.");
      setStatus("places");
    }
  }

  /**
   * Desafíos se pide recién cuando se abre la pestaña, y una sola vez: es una
   * consulta por cada negocio del cliente, así que no hay motivo para pagarla
   * si nunca la mira.
   */
  async function loadChallenges() {
    if (challengesLoaded || challengesLoading) return;
    setChallengesLoading(true);
    try {
      const res = await fetch("/api/mi-flikker/challenges");
      if (res.ok) {
        setChallenges((await res.json()) as MyFlikkerChallenge[]);
        setChallengesLoaded(true);
      }
    } catch {
      // Silencioso a propósito: la pestaña muestra su propio estado vacío,
      // que dice lo mismo que diría un error ("no hay nada para mostrar")
      // sin alarmar por algo que se arregla recargando.
    } finally {
      setChallengesLoading(false);
    }
  }

  /** Misma carga perezosa que los desafíos, y también una sola vez. */
  async function loadRewards() {
    if (rewardsLoaded || rewardsLoading) return;
    setRewardsLoading(true);
    try {
      const res = await fetch("/api/mi-flikker/rewards");
      if (res.ok) {
        setRewards((await res.json()) as MyFlikkerReward[]);
        setRewardsLoaded(true);
      }
    } catch {
      // Silencioso a propósito: la pestaña muestra su propio estado vacío,
      // que dice lo mismo que diría un error sin alarmar por algo que se
      // arregla recargando.
    } finally {
      setRewardsLoading(false);
    }
  }

  /**
   * Endpoint ya existía (`POST /api/mi-flikker/logout`) pero no tenía ningún
   * botón que lo llamara. Vuelve a la verificación por WhatsApp — no a
   * `/mi-flikker` de nuevo, que con la cookie ya borrada mostraría lo mismo
   * de una forma menos directa.
   */
  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/mi-flikker/logout", { method: "POST" });
    } finally {
      // Todo lo cargado se descarta: nada de la cuenta anterior puede
      // quedar visible detrás de la pantalla de verificación.
      setPlaces([]);
      setChallenges([]);
      setChallengesLoaded(false);
      setRewards([]);
      setRewardsLoaded(false);
      setLoggingOut(false);
      setStatus("verify");
    }
  }

  /*
    §10: el badge sale de la lista que ya se pidió — cero consultas extra,
    cero polling. Solo cuenta disponibles: canjeados y vencidos no son algo
    pendiente que el cliente tenga que atender.
  */
  const availableRewards = rewards.filter(
    (reward) => reward.status === "AVAILABLE",
  ).length;

  if (status === "verify") {
    return <VerifyScreen onVerified={load} />;
  }

  if (status === "loading") {
    return (
      <Shell>
        <div className="flex h-40 items-center justify-center text-[#8A91A3]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Cargando…
        </div>
      </Shell>
    );
  }

  return (
    <Shell activeTab={view} rewardsBadge={availableRewards}>
      <MiFlikkerTitle />
      <p className="mt-1 text-center text-sm text-[#8A91A3]">
        {TAB_SUBTITLES[view]}
      </p>

      {view === "cuenta" ? (
        <AccountTab onLogout={() => void logout()} loggingOut={loggingOut} />
      ) : view === "premios" ? (
        <RewardsTab rewards={rewards} loading={rewardsLoading} />
      ) : view === "desafios" ? (
        <ChallengesTab challenges={challenges} loading={challengesLoading} />
      ) : loadError ? (
        <p className="mt-6 text-center text-sm text-[#C0392B]">{loadError}</p>
      ) : places.length === 0 ? (
        /*
          Sin "ver locales cerca de mí": no existe discovery de negocios en el
          producto, y ofrecerlo sería mandar al cliente a una pantalla que no
          está. La única acción real acá es escanear el QR de un local.
        */
        <PublicState
          icon={QrCode}
          title="Todavía no tenés ningún lugar"
          description="Escaneá el QR de un local Flikker y tu tarjeta aparece acá sola. Si ya tenés una en algún negocio, verificá el mismo WhatsApp que usaste al registrarte ahí."
        />
      ) : (
        <ul className="mt-6 flex w-full flex-col gap-3 pb-4">
          {places.map((place) => (
            <li key={place.businessId}>
              <PlaceCard place={place} />
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

/**
 * Una fila de la lista de Lugares.
 *
 * Deliberadamente NO es la tarjeta de sellos. Antes esta lista era una
 * billetera de cupones apilados: la card con RewardGoal montaba el
 * `LoyaltyCard` completo y las demás se pintaban enteras con el gradiente del
 * negocio, solapadas entre sí. Con diez lugares eso era un mazo imposible de
 * escanear, y cada fila se veía de un producto distinto.
 *
 * Ahora es una lista vertical común: superficie Flikker, una card por lugar,
 * y del negocio solo su logo, el aro y un riel de 5px. La tarjeta completa —
 * sellos, colores, patrón, premio — vive en el detalle del lugar, que es
 * donde el cliente entra a mirarla.
 *
 * Toda la card es el tap target hacia `/mi-flikker/{businessId}`.
 */
/**
 * Una fila de Lugares.
 *
 * Segunda vuelta de diseño sobre la primera versión de esta card (que ya
 * había reemplazado el deck de cupones solapados). El problema esta vez no
 * era el solapamiento sino que la card se sentía "de IA": el riel de color
 * de 5px pegado al borde izquierdo de una card redondeada es exactamente el
 * patrón que hace que cualquier diseño lea como plantilla genérica, y el
 * progreso solo en texto ("4 de 6 sellos") no daba ninguna lectura rápida.
 *
 * Esta versión saca el riel — el logo (en una tarjeta cuadrada, no un aro
 * circular) es el único lugar donde el negocio aparece — y agrega una barra
 * de progreso real para las tarjetas con `rewardGoal`, que es lo que un
 * producto sólido (tipo Mercado Libre) usa para "cuánto llevás" en vez de
 * texto solo. El premio disponible pasa a ser un chip, no una línea de texto
 * en negrita — más legible como estado, no como otro párrafo más.
 */
function PlaceCard({ place }: { place: MyFlikkerPlace }) {
  const palette = useLogoPalette(
    place.businessId,
    place.logoUrl,
    place.primaryColor,
  );
  const brand = palette.primary;
  const summary = placeSummary(place);
  const pct = summary.progress
    ? Math.round((summary.progress.current / summary.progress.target) * 100)
    : 0;

  return (
    <Link
      href={`/mi-flikker/${place.businessId}`}
      className="flex items-center gap-3.5 rounded-[18px] border border-[#E7E8F1] bg-white p-4 transition-colors hover:border-[#DBDDE9] hover:bg-[#FCFCFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6A5DF0] focus-visible:ring-offset-2"
    >
      {/*
        Tarjeta cuadrada con esquinas suaves, no aro circular — un logo de
        negocio casi siempre es rectangular, así que forzarlo a un círculo lo
        recorta. El color de marca queda solo en el borde, muy sutil.
      */}
      {place.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={place.logoUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-[12px] border bg-white object-contain p-1.5"
          style={{ borderColor: "#ECEDF3" }}
        />
      ) : (
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px]"
          style={{
            backgroundColor: `color-mix(in srgb, ${brand} 10%, #FFFFFF)`,
            color: brand,
          }}
        >
          <MapPin className="h-[19px] w-[19px]" aria-hidden="true" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/*
            `break-words` en vez de `truncate`: un nombre largo se parte en
            dos líneas y la card crece. Cortarlo con puntos suspensivos deja
            al cliente sin saber en qué local está, que es lo único que esta
            fila tiene que responder.
          */}
          <p className="min-w-0 flex-1 break-words text-[16px] font-bold leading-tight tracking-[-0.01em] text-[#1A1A24]">
            {place.businessName}
          </p>
        </div>

        {summary.progress ? (
          <div className="mt-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-semibold text-[#3D4053]">
                {summary.primary}
              </p>
            </div>
            <div
              className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full"
              style={{ backgroundColor: "#EDEEF5" }}
              role="img"
              aria-label={summary.primary}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: "#6A5DF0" }}
              />
            </div>
            {summary.secondary ? (
              <p className="mt-1.5 text-[12px] font-medium text-[#8A90A6]">
                {summary.secondary}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-[13px] font-medium text-[#5A5A6E]">
            {summary.primary}
          </p>
        )}

        {summary.reward ? (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#F0F0FC] px-2.5 py-1 text-[12px] font-bold text-[#4A46C4]">
            <Gift className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
            {summary.reward}
          </span>
        ) : null}
      </div>

      <ChevronRight
        className="h-5 w-5 shrink-0 self-center text-[#B7BACB]"
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * Las dos o tres líneas que resumen un lugar, sin inventar ninguna.
 *
 * Reglas:
 *
 *  - Con tarjeta activa, el progreso es la línea principal, con la MISMA
 *    cuenta que muestra `LoyaltyCard` en el detalle (`min(progress, target)`);
 *    si las dos pantallas contaran distinto sería un bug visible.
 *  - Los premios disponibles son lo accionable, así que se llevan la línea
 *    destacada. Se cuentan TODAS las emisiones sin canjear, no solo la de la
 *    tarjeta, y no se deduplica por título: dos emisiones con el mismo nombre
 *    son dos premios distintos.
 *  - Sin premio, la segunda línea es cuánto falta para el próximo — solo si
 *    el backend efectivamente dice que falta algo.
 *  - Sin ninguna mecánica no se dibuja un 0/N inventado: se dice lo único
 *    que se sabe, que son las visitas.
 */
export function placeSummary(place: MyFlikkerPlace): {
  primary: string;
  secondary: string | null;
  reward: string | null;
  /**
   * Solo con tarjeta activa — la card usa esto para la barra de progreso,
   * calculada con el MISMO `min(progress, target)` que ya usan `primary` y
   * `LoyaltyCard` en el detalle. Nunca se deriva de nuevo en el componente:
   * un solo lugar decide el número, así que lista y detalle no pueden
   * mostrar dos cuentas distintas del mismo progreso.
   */
  progress: { current: number; target: number } | null;
} {
  const goal = place.rewardGoal;
  const rewardCount =
    (place.benefitAvailable ? 1 : 0) + (place.otherBenefits?.length ?? 0);
  const reward =
    rewardCount === 0
      ? null
      : rewardCount === 1
        ? "1 premio disponible"
        : `${rewardCount} premios disponibles`;

  if (!goal) {
    return {
      primary:
        place.visitsTotal === 0
          ? "Todavía no registraste visitas"
          : `${place.visitsTotal} ${place.visitsTotal === 1 ? "visita" : "visitas"}`,
      secondary: null,
      reward,
      progress: null,
    };
  }

  const stamps = Math.min(goal.progressVisits, goal.targetAdditionalVisits);
  const remaining = goal.remainingVisits;

  return {
    primary: `${stamps} de ${goal.targetAdditionalVisits} sellos`,
    secondary:
      remaining > 0
        ? `Te ${remaining === 1 ? "falta" : "faltan"} ${remaining} para tu premio`
        : null,
    reward,
    progress: { current: stamps, target: goal.targetAdditionalVisits },
  };
}

function VerifyScreen({ onVerified }: { onVerified: () => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    // Piloto V2 (#7) — el backend ya normaliza y valida el E.164 real, pero
    // no vale la pena gastar un OTP en un número con formato inválido.
    if (!isValidNationalPhone(phone)) {
      setError("Ingresá un número válido (7 a 9 dígitos).");
      return;
    }
    setSending(true);
    setError(null);
    const { ok } = await postJson("/api/mi-flikker/verify/start", { phone });
    setSending(false);
    if (ok) setStep("code");
    else setError("No pudimos enviar el código. Revisá el número.");
  }

  async function confirmCode() {
    setSending(true);
    setError(null);
    const { ok, data } = await postJson("/api/mi-flikker/verify/confirm", {
      phone,
      code,
    });
    setSending(false);
    if (ok) onVerified();
    else setError((data.message as string) ?? "Código inválido.");
  }

  return (
    <Shell>
      <MiFlikkerTitle />
      <p className="mt-1 text-center text-sm text-[#8A91A3]">
        Ingresá el mismo WhatsApp con el que te registraste en tus negocios
        Flikker para ver tus tarjetas y recompensas ahí.
      </p>

      <div className="mt-6 w-full space-y-3">
        {step === "phone" ? (
          <>
            <PhoneInput
              value={phone}
              onChange={setPhone}
              placeholder="91 624 988"
              className="rounded-[14px] [&>div]:rounded-[14px] [&>div]:border-white/80 [&>div]:bg-white/80"
            />
            <button
              type="button"
              disabled={sending || !isValidNationalPhone(phone)}
              onClick={() => void sendCode()}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#5C6BC0] py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enviar código
            </button>
          </>
        ) : (
          <>
            <OtpInput
              value={code}
              onChange={setCode}
              autoFocus
              disabled={sending}
            />
            <button
              type="button"
              disabled={sending || code.length !== 6}
              onClick={() => void confirmCode()}
              className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-[#5C6BC0] py-4 text-base font-bold text-white shadow-[0_10px_22px_rgba(92,107,192,0.22)] disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="w-full text-center text-xs font-semibold text-[#697084]"
            >
              Cambiar número
            </button>
          </>
        )}
        {error ? (
          <p className="text-center text-sm text-[#C0392B]">{error}</p>
        ) : null}
      </div>
    </Shell>
  );
}

/**
 * Mi Flikker es la casa del cliente: acá no hay un negocio dueño de la
 * pantalla, así que el shell va sin header de negocio. Es el mismo
 * `CustomerShell` que el resto de la experiencia — misma paleta, mismo aire,
 * mismos tokens — para que moverse entre Mi Flikker, un local y un beneficio
 * no se sienta como cambiar de app.
 */
/**
 * El marco de Mi Flikker: el shell de Flikker + la barra de navegación fija.
 *
 * `activeTab` ausente = pantalla de verificación (todavía no hay sesión):
 * ahí no se dibuja la barra, porque no hay a dónde navegar.
 *
 * `pb-24` en el contenido deja el aire que ocupa la barra fija, así la
 * última fila de cualquier lista nunca queda tapada.
 */
function Shell({
  children,
  activeTab,
  rewardsBadge = 0,
}: {
  children: React.ReactNode;
  activeTab?: MiFlikkerTab;
  rewardsBadge?: number;
}) {
  return (
    <CustomerShell footer={false}>
      <div className={activeTab ? "pb-24" : undefined}>{children}</div>
      {activeTab ? (
        <BottomNav active={activeTab} rewardsBadge={rewardsBadge} />
      ) : null}
    </CustomerShell>
  );
}
