import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import CheckoutSuccessClient from "./checkout-success-client";

/**
 * `MERCADO_PAGO_SUBSCRIPTION_BACK_URL` (Parte 5D) — adónde vuelve la
 * persona después de pagar. Nunca certifica nada por sí sola: el estado
 * real se confirma recién acá, consultando al backend (que a su vez
 * reconcilia con Mercado Pago si hace falta — ver `checkout-success-client`
 * y `PreOnboardingCheckoutService#getStatus`).
 */
export default async function CheckoutSuccessPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <CheckoutSuccessClient />;
}
