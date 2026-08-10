import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import RedeemClient from "./redeem-client";

/**
 * Canje por URL — el destino final del QR que el cliente muestra
 * ("Mostrar QR para canjear"). El empleado lo abre con la cámara nativa del
 * teléfono (no una cámara dentro de Flikker) y llega directo acá.
 *
 * Si no hay sesión, vuelve después del login al MISMO canje — el token
 * nunca se pierde, viaja en la propia URL de `next`.
 */
export default async function RedeemPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/redeem/${token}`)}`);
  }

  return <RedeemClient code={token} />;
}
