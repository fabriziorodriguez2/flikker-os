"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Gift, Loader2, QrCode } from "lucide-react";
import { useLogoPalette } from "@/lib/use-logo-palette";
import {
  bestContrastOn,
  contrastRatio,
  normalizeHex,
} from "@/lib/loyalty-card-theme";
import MiFlikkerHeader from "@/components/public/mi-flikker-header";
import PublicState from "@/components/public/public-state";
import CustomerShell from "@/components/public/customer-shell";
import BottomNav, { type MiFlikkerTab } from "@/components/public/bottom-nav";
import PhoneInput, { isValidNationalPhone } from "@/components/ui/phone-input";
import OtpInput from "@/components/ui/otp-input";
import ChallengesTab, { type MyFlikkerChallenge } from "./challenges-tab";
import RewardsTab, { type MyFlikkerReward } from "./rewards-tab";
import AccountTab, { type AccountProfile } from "./account-tab";

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
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [challengesError, setChallengesError] = useState(false);
  const [rewardsError, setRewardsError] = useState(false);

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
    if (status !== "places") return;
    if (view === "desafios" || view === "cuenta") void loadChallenges();
    if (view === "premios") void loadRewards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, status]);

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

  useEffect(() => {
    if (view !== "cuenta" || status !== "places") return;
    const controller = new AbortController();
    setProfileError(false);
    void (async () => {
      try {
        const res = await fetch("/api/mi-flikker/account", {
          signal: controller.signal,
        });
        if (res.status === 401) {
          setStatus("verify");
          return;
        }
        if (!res.ok) throw new Error();
        const value = (await res.json()) as AccountProfile;
        if (!controller.signal.aborted) setProfile(value);
      } catch {
        if (!controller.signal.aborted) setProfileError(true);
      }
    })();
    return () => controller.abort();
  }, [view, status]);

  async function load() {
    setStatus("loading");
    setLoadError(null);
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
   * Desafíos se pide al abrir su pestaña o el resumen de Cuenta, una sola vez.
   */
  async function loadChallenges() {
    if (challengesLoaded || challengesLoading) return;
    setChallengesLoading(true);
    setChallengesError(false);
    try {
      const res = await fetch("/api/mi-flikker/challenges");
      if (res.status === 401) {
        setStatus("verify");
        return;
      }
      if (!res.ok) throw new Error();
      if (res.ok) {
        setChallenges((await res.json()) as MyFlikkerChallenge[]);
        setChallengesLoaded(true);
      }
    } catch {
      setChallengesError(true);
    } finally {
      setChallengesLoading(false);
    }
  }

  /** Misma carga perezosa que los desafíos, y también una sola vez. */
  async function loadRewards() {
    if (rewardsLoaded || rewardsLoading) return;
    setRewardsLoading(true);
    setRewardsError(false);
    try {
      const res = await fetch("/api/mi-flikker/rewards");
      if (res.status === 401) {
        setStatus("verify");
        return;
      }
      if (!res.ok) throw new Error();
      if (res.ok) {
        setRewards((await res.json()) as MyFlikkerReward[]);
        setRewardsLoaded(true);
      }
    } catch {
      setRewardsError(true);
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
      setProfile(null);
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
  const activeChallengeCount = challenges.filter(
    (c) => c.kind !== "mission" || c.status === "ACTIVE",
  ).length;
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
      {view !== "cuenta" ? (
        <MiFlikkerHeader
          tab={view}
          chip={
            view === "lugares"
              ? loadError
                ? null
                : places.length + (places.length === 1 ? " lugar" : " lugares")
              : view === "premios"
                ? rewardsLoaded
                  ? availableRewards +
                    (availableRewards === 1 ? " disponible" : " disponibles")
                  : null
                : challengesLoaded
                  ? activeChallengeCount +
                    (activeChallengeCount === 1 ? " activo" : " activos")
                  : null
          }
        />
      ) : null}

      {view === "cuenta" ? (
        <AccountTab
          profile={profile}
          error={profileError}
          metrics={
            !loadError && rewardsLoaded && challengesLoaded
              ? {
                  places: places.length,
                  rewards: availableRewards,
                  challenges: activeChallengeCount,
                }
              : null
          }
          onLogout={() => void logout()}
          loggingOut={loggingOut}
        />
      ) : view === "premios" ? (
        <RewardsTab
          rewards={rewards}
          loading={rewardsLoading || (!rewardsLoaded && !rewardsError)}
          error={rewardsError}
          onRetry={() => void loadRewards()}
        />
      ) : view === "desafios" ? (
        <ChallengesTab
          challenges={challenges}
          loading={challengesLoading || (!challengesLoaded && !challengesError)}
          error={challengesError}
          onRetry={() => void loadChallenges()}
        />
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
          title="Todavía no tenés lugares"
          description="Escaneá el QR de un local Flikker y tu tarjeta aparece acá sola. Si ya tenés una en algún negocio, verificá el mismo WhatsApp que usaste al registrarte ahí."
        />
      ) : (
        <ul className="flex w-full flex-col pb-4 [&>li+li]:-mt-3">
          {places.map((place) => (
            <li key={place.businessId}>
              <PlacePass place={place} />
            </li>
          ))}
        </ul>
      )}
    </Shell>
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
    <CustomerShell
      footer={false}
      wallet={Boolean(activeTab)}
      compact={Boolean(activeTab)}
    >
      <div
        className={
          activeTab
            ? "flex min-h-[calc(100dvh-2.5rem)] flex-col pb-24 [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]"
            : undefined
        }
      >
        {children}
      </div>
      {activeTab ? (
        <BottomNav active={activeTab} rewardsBadge={rewardsBadge} />
      ) : null}
    </CustomerShell>
  );
}
/** Compact wallet pass; progress and awards use the existing read model. */
export function PlacePass({ place }: { place: MyFlikkerPlace }) {
  const palette = useLogoPalette(
    place.businessId,
    place.logoUrl,
    place.primaryColor,
  );
  const color =
    normalizeHex(place.loyaltyCardColor) ??
    normalizeHex(place.primaryColor) ??
    palette.primary;
  const requested = normalizeHex(place.loyaltyCardTextColor);
  const text =
    requested && contrastRatio(requested, color) >= 4.5
      ? requested
      : bestContrastOn(color);
  const summary = placeSummary(place);
  return (
    <Link
      href={`/mi-flikker/${encodeURIComponent(place.businessId)}`}
      data-place-pass
      className="relative block overflow-hidden rounded-[20px] px-4 pb-6 pt-3.5 shadow-[0_3px_8px_#17171D08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19191F] focus-visible:ring-offset-2"
      style={{ backgroundColor: color, color: text }}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-white text-xs font-bold text-[#19191F]">
          {place.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={place.logoUrl}
              alt=""
              className="h-full w-full object-contain p-1"
            />
          ) : (
            place.businessName.trim().slice(0, 1).toUpperCase()
          )}
        </span>
        <p className="min-w-0 flex-1 break-words text-[13px] font-bold leading-tight">
          {place.businessName}
        </p>
        {summary.progress && summary.progress.target <= 12 ? (
          <span className="shrink-0 font-bold">
            <span className="text-xl">{summary.progress.current}</span>
            <span className="text-[11px]">/{summary.progress.target}</span>
          </span>
        ) : place.visitsTotal > 0 ? (
          <span className="shrink-0 text-[11px] font-semibold">
            {summary.primary}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {summary.progress ? (
          <span role="img" aria-label={summary.primary} className="flex gap-1">
            {Array.from(
              { length: Math.min(summary.progress.target, 12) },
              (_, i) => (
                <span
                  key={i}
                  className="h-2 w-2 rounded-full border"
                  style={{
                    borderColor: text,
                    backgroundColor:
                      i < summary.progress!.current ? text : "transparent",
                    opacity: i < summary.progress!.current ? 1 : 0.6,
                  }}
                />
              ),
            )}
          </span>
        ) : null}
        <p className="text-[10px] leading-snug">
          {summary.progress
            ? (summary.secondary ?? "Completaste tu tarjeta")
            : place.visitsTotal === 0
              ? summary.primary
              : null}
        </p>
      </div>
      {summary.reward ? (
        <div
          className="-mx-4 -mb-2 mt-4 flex items-center gap-3 border-t px-4 pb-1 pt-4"
          style={{ borderColor: `${text}33` }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#6851EC]">
            <Gift className="h-5 w-5" />
          </span>
          <p className="min-w-0 flex-1 text-base font-bold leading-tight">
            {summary.reward}
          </p>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </div>
      ) : null}
    </Link>
  );
}
