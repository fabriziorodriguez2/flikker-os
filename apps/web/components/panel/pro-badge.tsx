import { Lock } from "lucide-react";

/**
 * El badge PRO. Uno solo para todo el producto.
 *
 * Existía duplicado a mano en `automations-tab` y en `ProUpgradePrompt`, con
 * clases distintas. Un badge que se ve distinto según la pantalla deja de
 * leerse como "esto es una función del plan" y pasa a leerse como decoración.
 *
 * Deliberadamente sobrio: sin emoji, sin "PREMIUM", sin llamas. Violeta de
 * marca sobre lavanda, el candado de Lucide, y nada más.
 */
export default function ProBadge({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[#F1EDFF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7258D6] ${className}`}
    >
      <Lock className="h-3 w-3" aria-hidden="true" />
      Pro
    </span>
  );
}
