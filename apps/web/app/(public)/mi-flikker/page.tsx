import { getFlikkerAccountToken } from "@/lib/flikker-account-cookie";
import MiFlikkerClient from "./mi-flikker-client";

export default async function MiFlikkerPage() {
  // Presence of the cookie only tells the client whether to attempt a
  // recognized load first — the GET render itself stays side-effect free,
  // same convention as the check-in page.
  const hasSession = Boolean(await getFlikkerAccountToken());
  return <MiFlikkerClient hasSession={hasSession} />;
}
