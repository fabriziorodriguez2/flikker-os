import Link from "next/link";
import { Gift, LayoutGrid, Target, User, type LucideIcon } from "lucide-react";

export type MiFlikkerTab = "lugares" | "desafios" | "premios" | "cuenta";

const TABS: { key: MiFlikkerTab; label: string; icon: LucideIcon }[] = [
  { key: "lugares", label: "Lugares", icon: LayoutGrid },
  { key: "desafios", label: "Desafíos", icon: Target },
  { key: "premios", label: "Premios", icon: Gift },
  { key: "cuenta", label: "Cuenta", icon: User },
];

/**
 * La navegación de Mi Flikker — barra fija abajo, como cualquier app mobile.
 *
 * ## Por qué son links con `?tab=`, y no estado
 *
 * La barra también vive en el detalle de un lugar (`/mi-flikker/[businessId]`),
 * que es una ruta aparte. Con la pestaña en estado de React, tocar "Premios"
 * desde ahí no podría llevar a Premios: habría que volver primero. Con el
 * query param, cada pestaña es una URL y la barra funciona igual desde
 * cualquier pantalla — sin agregar rutas nuevas, que en este segmento
 * chocarían con `[businessId]`.
 *
 * `pb-[env(safe-area-inset-bottom)]` es lo que evita que la barra quede
 * debajo del gesto de home en un iPhone.
 */
export default function BottomNav({
  active,
  /** Cantidad de premios disponibles. `0`/ausente no dibuja nada. */
  rewardsBadge = 0,
}: {
  active: MiFlikkerTab;
  rewardsBadge?: number;
}) {
  return (
    <nav
      aria-label="Secciones de Mi Flikker"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-white pb-[env(safe-area-inset-bottom)]"
      style={{ borderColor: "var(--pub-surface-border, #E7E8F1)" }}
    >
      <ul className="mx-auto flex w-full max-w-md items-stretch">
        {TABS.map(({ key, label, icon: Icon }) => {
          const current = key === active;
          return (
            <li key={key} className="flex-1">
              <Link
                href={key === "lugares" ? "/mi-flikker" : `/mi-flikker?tab=${key}`}
                aria-current={current ? "page" : undefined}
                data-tab={key}
                data-active={current ? "true" : "false"}
                className="flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 transition-colors"
                style={{
                  color: current
                    ? "var(--pub-accent, #6A5DF0)"
                    : "var(--pub-text-soft, #8A90A6)",
                }}
              >
                <span className="relative">
                  <Icon
                    className="h-[22px] w-[22px]"
                    strokeWidth={current ? 2.4 : 1.9}
                    aria-hidden="true"
                  />
                  {key === "premios" && rewardsBadge > 0 ? (
                    <span
                      className="absolute -right-2 -top-1.5 min-w-[17px] rounded-full px-[5px] text-center text-[10px] font-bold leading-[17px]"
                      style={{
                        backgroundColor: "var(--pub-accent, #6A5DF0)",
                        color: "var(--pub-on-accent, #FFFFFF)",
                      }}
                    >
                      {rewardsBadge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] font-semibold leading-none">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
