import type { LucideIcon } from "lucide-react";

/**
 * Ícono en círculo + título + descripción — el patrón de encabezado que se
 * repite en cada sub-sección de Configuración (estilo Fiddelik). Un solo
 * lugar para no repetir el mismo `<span className="flex h-9 w-9...">` a
 * mano en cada archivo.
 */
export default function ProgramSectionHeading({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#EEF0FB] text-[#5C6BC0]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-base font-bold text-[#1A202C]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-[#8891A4]">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
