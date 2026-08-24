import { notFound } from "next/navigation";
import { getCheckinToken } from "@/lib/checkin-cookie";
import CheckinClient from "./checkin-client";

export interface PublicBenefit {
  type: string;
  title: string;
  description: string | null;
  terms: string | null;
}

export interface CheckinLanding {
  source: { name: string; type: string };
  business: {
    businessName: string;
    logoUrl: string | null;
    primaryColor: string | null;
    /** Fondo explícito del formulario. Null = paleta automática de marca. */
    checkinBackgroundColor: string | null;
    googleBusinessProfileUrl: string | null;
    /** Apariencia de la tarjeta de sellos. Null = usar la marca del negocio. */
    loyaltyCardColor: string | null;
    loyaltyCardTextColor: string | null;
    loyaltyCardBackgroundImage: string | null;
    loyaltyStampAreaColor: string | null;
    loyaltyStampColor: string | null;
    loyaltyStampIcon: string | null;
    loyaltyShowBusinessName: boolean;
    loyaltyStampBackgroundPattern: string | null;
    loyaltyStampBackgroundOpacity: number | null;
  };
  benefit: PublicBenefit | null;
  benefitText: string | null;
  /** Programa → Página de inscripción. Encabezado propio, opcional. */
  welcomeMessage: string | null;
  /**
   * Si este negocio exige el código rotativo que se muestra en el local.
   * Solo viaja el HECHO de que se exige, nunca el código: mandarlo acá lo
   * entregaría a cualquiera que abra el link desde su casa, que es
   * exactamente lo que este mecanismo evita. El backend vuelve a decidir en
   * cada POST — el frontend nunca es la autoridad.
   */
  presence?: { required: boolean; mode: string };
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function getLanding(token: string): Promise<CheckinLanding | null> {
  try {
    const res = await fetch(
      `${API_URL}/public/checkin/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as CheckinLanding;
  } catch {
    return null;
  }
}

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const landing = await getLanding(token);
  if (!landing) notFound();

  // Presence of the cookie tells the client to attempt a recognized check-in
  // first. The actual (state-changing) check-in is a POST from the client — a
  // GET render must stay side-effect free.
  const hasSession = Boolean(await getCheckinToken());

  return (
    <CheckinClient token={token} landing={landing} hasSession={hasSession} />
  );
}
