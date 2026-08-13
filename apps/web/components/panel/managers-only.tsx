"use client";

import Link from "next/link";
import { useIsOwnerOrAdmin } from "@/app/(panel)/role-context";

/**
 * Envoltorio para pantallas de Configuración cuyo backend entero es
 * OWNER/ADMIN — no solo la escritura, sino también la lectura.
 *
 * `SettingsTabs` ya oculta estas pestañas para OPERATOR, pero eso es
 * navegación, no seguridad: alguien con la URL guardada llega igual. Sin este
 * guard, el componente de adentro monta, dispara sus `fetch` de datos, recibe
 * 403 en todos, y el OPERATOR ve una pantalla rota en vez de un mensaje que
 * explique por qué no puede estar ahí.
 *
 * Distinto del patrón de Negocio (`settings-client.tsx`), donde SÍ hay algo
 * legítimo para que un OPERATOR mire en modo lectura: acá no hay nada que
 * mostrar, porque ni el `GET` pasa el guard del backend.
 */
export default function ManagersOnly({
  children,
  what,
}: {
  children: React.ReactNode;
  /** Qué es esta pantalla, para el mensaje: "las integraciones". */
  what: string;
}) {
  const canManage = useIsOwnerOrAdmin();

  if (!canManage) {
    return (
      <div className="rounded-[16px] border border-[color:var(--border)] bg-white px-6 py-10 text-center">
        <p className="text-sm font-semibold text-[color:var(--foreground)]">
          Esta sección es solo para el dueño o un administrador
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[color:var(--text-muted)]">
          No tenés permiso para ver {what}. Pedile a un dueño o administrador
          del negocio que las revise.
        </p>
        <Link
          href="/dashboard/settings/cuenta"
          className="mt-5 inline-flex h-10 items-center rounded-[11px] border border-[color:var(--border)] bg-white px-4 text-sm font-semibold text-[color:var(--foreground)] hover:border-[color:var(--brand-accent)]"
        >
          Ir a Cuenta
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
