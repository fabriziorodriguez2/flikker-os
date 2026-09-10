"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Gift, Loader2, MapPin, QrCode } from "lucide-react";
import { useLogoPalette } from "@/lib/use-logo-palette";
import PublicState from "@/components/public/public-state";
import CustomerShell from "@/components/public/customer-shell";
import AccountMenu from "@/components/public/account-menu";
import PhoneInput, { isValidNationalPhone } from "@/components/ui/phone-input";
import OtpInput from "@/components/ui/otp-input";
import ChallengesTab, {
  type MyFlikkerChallenge,
} from "./challenges-tab";

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

export default function MiFlikkerClient({
  hasSession,
}: {
  hasSession: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "verify" | "places">(
    hasSession ? "loading" : "verify",
  );
  const [places, setPlaces] = useState<MyFlikkerPlace[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<"lugares" | "desafios">("lugares");
  const [challenges, setChallenges] = useState<MyFlikkerChallenge[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [challengesLoaded, setChallengesLoaded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!hasSession) return;
    void load();
  }, [hasSession]);

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
      setPlaces([]);
      setChallenges([]);
      setChallengesLoaded(false);
      setLoggingOut(false);
      setStatus("verify");
    }
  }

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
    <Shell>
      {/*
        El avatar de cuenta vive en su propia fila, arriba de todo — no
        compite con el wordmark ni con los tabs. `w-9` a la izquierda es un
        spacer del mismo ancho que el botón, así el título queda centrado de
        verdad en vez de corrido hacia la izquierda.
      */}
      <div className="flex w-full items-center justify-between">
        <span className="h-9 w-9" aria-hidden="true" />
        <div className="flex-1">
          <MiFlikkerTitle />
        </div>
        <AccountMenu onLogout={() => void logout()} loggingOut={loggingOut} />
      </div>
      <p className="mt-1 text-center text-sm text-[#8A91A3]">
        Todas tus recompensas Flikker en un solo lugar.
      </p>

      <div
        className="mx-auto mt-6 flex w-fit rounded-[12px] bg-[#ECEEF4] p-1 text-sm font-semibold"
        role="tablist"
        aria-label="Secciones de Mi Flikker"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "lugares"}
          onClick={() => setView("lugares")}
          className={`rounded-[9px] px-4 py-2 transition-colors ${
            view === "lugares"
              ? "bg-white text-[#4A56A6] shadow-[0_1px_4px_rgba(17,22,59,0.12)]"
              : "text-[#7F879C]"
          }`}
        >
          Lugares
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "desafios"}
          onClick={() => {
            setView("desafios");
            void loadChallenges();
          }}
          className={`rounded-[9px] px-4 py-2 transition-colors ${
            view === "desafios"
              ? "bg-white text-[#4A56A6] shadow-[0_1px_4px_rgba(17,22,59,0.12)]"
              : "text-[#7F879C]"
          }`}
        >
          Desafíos
        </button>
      </div>

      {view === "desafios" ? (
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
        <ul className="mt-6 flex w-full flex-col gap-3 pb-12">
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
function PlaceCard({ place }: { place: MyFlikkerPlace }) {
  const palette = useLogoPalette(
    place.businessId,
    place.logoUrl,
    place.primaryColor,
  );
  const brand = palette.primary;
  const summary = placeSummary(place);

  return (
    <Link
      href={`/mi-flikker/${place.businessId}`}
      className="relative flex items-center gap-3.5 overflow-hidden rounded-[16px] border border-[#E7E8F1] bg-white py-4 pl-5 pr-4 transition-colors hover:bg-[#FCFCFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B5BD6] focus-visible:ring-offset-2"
    >
      {/* Único rastro cromático del negocio, junto con el aro del logo. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[5px]"
        style={{ backgroundColor: brand }}
      />

      {place.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={place.logoUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded-full border-2 bg-white object-contain p-1"
          style={{ borderColor: brand }}
        />
      ) : (
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 bg-white"
          style={{ borderColor: brand, color: brand }}
        >
          <MapPin className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        {/*
          `break-words` en vez de `truncate`: un nombre largo se parte en dos
          líneas y la card crece. Cortarlo con puntos suspensivos deja al
          cliente sin saber en qué local está, que es lo único que esta fila
          tiene que responder.
        */}
        <p className="break-words text-[16px] font-extrabold leading-tight tracking-[-0.02em] text-[#14151F]">
          {place.businessName}
        </p>
        <p className="mt-1 text-[13px] font-medium text-[#5A5F76]">
          {summary.primary}
        </p>
        {summary.reward ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-bold text-[#4A56A6]">
            <Gift className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{summary.reward}</span>
          </p>
        ) : summary.secondary ? (
          <p className="mt-1 text-[13px] font-medium text-[#8A90A6]">
            {summary.secondary}
          </p>
        ) : null}
      </div>

      <ChevronRight
        className="h-5 w-5 shrink-0 self-center text-[#8A90A6]"
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
            <OtpInput value={code} onChange={setCode} autoFocus />
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
function Shell({ children }: { children: React.ReactNode }) {
  return <CustomerShell footer={false}>{children}</CustomerShell>;
}
