"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Gift, Loader2, Lock } from "lucide-react";
import { useLogoPalette } from "@/lib/use-logo-palette";
import CustomerShell from "@/components/public/customer-shell";
import LoyaltyCard from "@/components/public/loyalty-card";
import BenefitCard from "@/components/public/benefit-card";
import ChallengeRow from "@/components/public/challenge-row";
import PublicState from "@/components/public/public-state";
import { toRow, type MyFlikkerChallenge } from "../challenges-tab";

interface PlaceMission {
  missionId: string;
  name: string;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED";
  progress: {
    current: number;
    target: number;
    remaining: number;
    complete: boolean;
  };
  /** Ya resuelto por el backend en el timezone del negocio — ver `formatDeadline`. */
  lastDayKey: string;
  rewardName: string | null;
  rewardHidden: boolean;
  rewardCode: string | null;
}

interface PlaceStreak {
  currentWeeks: number;
  state: "ACTIVE" | "AT_RISK";
  deadlineDayKey: string;
}

interface PlaceReturnChallenge {
  challengeId: string;
  deadlineDayKey: string;
}

interface MyFlikkerPlace {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
  /** Apariencia de la tarjeta. Null = usar la marca del negocio. */
  loyaltyCardColor?: string | null;
  loyaltyCardTextColor?: string | null;
  loyaltyCardBackgroundImage?: string | null;
  loyaltyStampAreaColor?: string | null;
  loyaltyStampColor?: string | null;
  loyaltyStampIcon?: string | null;
  loyaltyShowBusinessName?: boolean;
  loyaltyStampBackgroundPattern?: string | null;
  loyaltyStampBackgroundOpacity?: number | null;
  primaryColor: string | null;
  /** Color de la experiencia pública del negocio — el mismo del check-in. */
  checkinBackgroundColor?: string | null;
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
  benefitAvailable: { name: string; code: string; expiresAt: string | null } | null;
  /**
   * Otros beneficios otorgados y sin canjear — típicamente por una
   * promoción manual (Notificaciones → Promociones ya puede elegir
   * cualquier Benefit del catálogo). Independiente de `benefitAvailable`
   * (esa es solo la recompensa de una tarjeta ya desbloqueada).
   */
  otherBenefits: {
    title: string;
    description: string | null;
    terms: string | null;
    code: string;
    expiresAt: string | null;
  }[];
  /** Misiones vivas o recién completadas de ESTE negocio. */
  missions: PlaceMission[];
  /** La racha de visitas en ESTE negocio, o `null` si no vale la pena mostrarla. */
  streak: PlaceStreak | null;
  /** El desafío de vuelta vivo en ESTE negocio, o `null` si no hay uno. */
  returnChallenge: PlaceReturnChallenge | null;
}

/**
 * Fase E §20: only customer-facing fields — name/logo, visits, last visit,
 * current goal/progress, unlocked benefit. Never segment, assignment,
 * experiment or uplift; those never leave the business dashboard.
 */
export default function PlaceDetailClient({
  businessId,
}: {
  businessId: string;
}) {
  const [place, setPlace] = useState<MyFlikkerPlace | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ok" | "error" | "unauthorized"
  >("loading");
  const palette = useLogoPalette(
    place?.businessId ?? businessId,
    place?.logoUrl ?? null,
    place?.primaryColor ?? null,
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function load() {
    setStatus("loading");
    const res = await fetch(`/api/mi-flikker/places/${businessId}`);
    if (res.status === 401) {
      setStatus("unauthorized");
      return;
    }
    if (!res.ok) {
      setStatus("error");
      return;
    }
    setPlace((await res.json()) as MyFlikkerPlace);
    setStatus("ok");
  }

  if (status === "unauthorized") {
    return (
      <Shell>
        <PublicState
          icon={Lock}
          title="Tu sesión se cerró"
          description="Confirmá tu número y volvés justo a donde estabas. No perdés ni sellos ni premios."
          action={{ label: "Entrar a Mi Flikker", href: "/mi-flikker" }}
        />
      </Shell>
    );
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

  if (status === "error" || !place) {
    return (
      <Shell>
        <PublicState
          icon={AlertTriangle}
          tone="warning"
          title="No pudimos cargar este lugar"
          description="Puede ser algo momentáneo. Probá de nuevo o volvé a tus lugares."
          action={{ label: "Ver mis lugares", href: "/mi-flikker" }}
        />
      </Shell>
    );
  }

  const brand = palette.primary;
  const challenges = placeChallenges(place);

  return (
    // 1. El negocio: avatar + nombre en el header del shell, no como fondo.
    <Shell
      brand={brand}
      business={{ name: place.businessName, logoUrl: place.logoUrl }}
      back={{ href: "/mi-flikker", label: "Mis lugares" }}
    >
      {/* 2. Beneficios disponibles — lo accionable primero. Cada emisión es
             una card propia: dos beneficios con el mismo título y códigos
             distintos son dos cosas distintas y las dos se muestran. */}
      {place.benefitAvailable ? (
        <div className="mb-4">
          <BenefitCard
            title={place.benefitAvailable.name}
            code={place.benefitAvailable.code}
            reveal="tap"
            brand={brand}
            meta={
              place.benefitAvailable.expiresAt
                ? [
                    {
                      label: "Vence",
                      value: new Date(
                        place.benefitAvailable.expiresAt,
                      ).toLocaleDateString("es-UY"),
                    },
                  ]
                : undefined
            }
          />
        </div>
      ) : null}

      {place.otherBenefits.map((benefit, i) => (
        <div className="mb-4" key={`${benefit.code}-${i}`}>
          <BenefitCard
            title={benefit.title}
            description={benefit.description}
            terms={benefit.terms}
            code={benefit.code}
            reveal="tap"
            brand={brand}
            meta={
              benefit.expiresAt
                ? [
                    {
                      label: "Vence",
                      value: new Date(benefit.expiresAt).toLocaleDateString(
                        "es-UY",
                      ),
                    },
                  ]
                : undefined
            }
          />
        </div>
      ))}

      {/* 3. La tarjeta activa, si existe. Sin RewardGoal no se dibuja
             ninguna tarjeta decorativa. */}
      {place.rewardGoal ? (
        <LoyaltyCard
          rewardName={place.rewardGoal.incentiveName}
          progress={place.rewardGoal.progressVisits}
          target={place.rewardGoal.targetAdditionalVisits}
          bonusStamps={place.rewardGoal.bonusStamps ?? 0}
          appearance={{
            cardColor: place.loyaltyCardColor ?? brand,
            textColor: place.loyaltyCardTextColor,
            backgroundImage: place.loyaltyCardBackgroundImage,
            stampAreaColor: place.loyaltyStampAreaColor,
            stampColor: place.loyaltyStampColor,
            stampIcon: place.loyaltyStampIcon,
            logoUrl: place.logoUrl,
            businessName: place.businessName,
            showBusinessName: place.loyaltyShowBusinessName,
            stampBackgroundPattern: place.loyaltyStampBackgroundPattern,
            stampBackgroundOpacity: place.loyaltyStampBackgroundOpacity,
          }}
        />
      ) : null}

      {/* 4. Desafíos de este lugar — sin encabezado de negocio: ya se sabe
             en cuál estamos. */}
      {challenges.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {challenges.map((challenge) => (
            <ChallengeRow key={challengeKey(challenge)} {...toRow(challenge)} />
          ))}
        </ul>
      ) : null}

      {/* 5. Estado vacío real: ni tarjeta, ni beneficios, ni desafíos. */}
      {!place.rewardGoal &&
      !place.benefitAvailable &&
      place.otherBenefits.length === 0 &&
      challenges.length === 0 ? (
        <PublicState
          icon={Gift}
          title="Todavía no hay nada activo acá"
          description="Cuando este local active una tarjeta de sellos, un beneficio o un desafío, te aparece en esta pantalla."
          compact
        />
      ) : null}
    </Shell>
  );
}

/**
 * Los desafíos de este negocio, en el mismo orden de prioridad que usa la
 * lista global (rank() en my-flikker.service.ts): primero el desafío de
 * vuelta, después las misiones, después la racha.
 *
 * Se arman con la MISMA forma que la lista cruzada para poder pasar por
 * `toRow`, que es donde vive el copy de cada mecánica.
 */
function placeChallenges(place: MyFlikkerPlace): MyFlikkerChallenge[] {
  const base = {
    businessId: place.businessId,
    businessName: place.businessName,
    logoUrl: place.logoUrl,
  };
  const out: MyFlikkerChallenge[] = [];

  if (place.returnChallenge) {
    out.push({
      ...base,
      kind: "return_challenge",
      challengeId: place.returnChallenge.challengeId,
      deadlineDayKey: place.returnChallenge.deadlineDayKey,
    });
  }

  for (const mission of place.missions) {
    out.push({
      ...base,
      kind: "mission",
      missionId: mission.missionId,
      name: mission.name,
      description: null,
      status: mission.status,
      progress: mission.progress,
      endsAt: "",
      timezone: "",
      lastDayKey: mission.lastDayKey,
      rewardName: mission.rewardName,
      rewardHidden: mission.rewardHidden,
      rewardCode: mission.rewardCode,
    });
  }

  if (place.streak) {
    out.push({
      ...base,
      kind: "streak",
      currentWeeks: place.streak.currentWeeks,
      state: place.streak.state,
      deadlineDayKey: place.streak.deadlineDayKey,
    });
  }

  return out;
}

function challengeKey(challenge: MyFlikkerChallenge): string {
  if (challenge.kind === "return_challenge") {
    return `rc:${challenge.challengeId}`;
  }
  if (challenge.kind === "streak") return `streak:${challenge.businessId}`;
  return `mission:${challenge.missionId}`;
}

/**
 * El detalle de un lugar es la continuación del recorrido que arrancó en el
 * QR, así que comparte el MISMO marco que el check-in: `CustomerShell`, con
 * identidad Flikker. El negocio queda donde tiene que estar — su avatar, su
 * nombre y su tarjeta — en vez de teñir la pantalla entera, que era lo que
 * hacía que la app pareciera otra en cada local.
 */
function Shell({
  children,
  brand,
  business,
  back,
}: {
  children: React.ReactNode;
  brand?: string | null;
  business?: { name: string; logoUrl?: string | null } | null;
  back?: { href: string; label: string } | null;
}) {
  return (
    <CustomerShell
      business={business}
      eyebrow="Tu tarjeta en Flikker"
      brand={brand}
      back={back}
    >
      {children}
    </CustomerShell>
  );
}
