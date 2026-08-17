import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ProgramaClient from "./programa-client";

// Syne para títulos / Montserrat para el resto: ya es el design system
// global de Flikker (`app/layout.tsx` + `globals.css` — `font-sans`/`body`
// usan `--font-montserrat`, `font-display` usa `--font-syne`), así que esta
// página no necesita cargar nada propio. `PageHeader` y los encabezados de
// sección de Programa ya usan `font-display` (Syne); el resto hereda
// Montserrat del layout.
export default async function ProgramaPage() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/login");

  return <ProgramaClient />;
}
