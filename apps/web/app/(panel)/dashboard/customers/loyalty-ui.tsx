"use client";

/**
 * Piezas compartidas entre la lista de Clientes y el detalle, para que las
 * dos pantallas digan lo mismo con las mismas palabras.
 *
 * Toda la traducción de claves de producto a español vive acá. La API nunca
 * manda texto para mostrar: manda claves (`nuevo`, `ausente`,
 * `recordatorio_progreso`) y el panel decide cómo se dicen. Así el enum de
 * segmentación de Retention V2 no llega jamás a la pantalla.
 */

// Los nombres visibles de los tipos de mensaje viven en un solo lugar y se
// re-exportan desde acá para que el detalle de cliente no tenga que saber
// dónde están.
export { MESSAGE_LABEL, type MessageKind } from "@/lib/message-kind";

export type RecurrenceKey =
  | "nuevo"
  | "vuelve_seguido"
  | "volvio"
  | "demorado"
  | "ausente";

export const RECURRENCE: Record<
  RecurrenceKey,
  { label: string; className: string }
> = {
  nuevo: { label: "Nuevo", className: "bg-[#EEF0FB] text-[#4A56A6]" },
  vuelve_seguido: {
    label: "Vuelve seguido",
    className: "bg-[#EAF7EF] text-[#147A5B]",
  },
  volvio: { label: "Volvió", className: "bg-[#EAF7EF] text-[#147A5B]" },
  demorado: {
    label: "Se está demorando",
    className: "bg-[#FFF7EE] text-[#8A520D]",
  },
  ausente: {
    label: "Hace tiempo que no viene",
    className: "bg-[#F3F4F8] text-[#6B7280]",
  },
};


const MS_PER_DAY = 86_400_000;

/** "Hoy", "Ayer", "Hace 3 días", y a partir de ahí la fecha. */
export function relativeDay(value: string | null | undefined): string {
  if (!value) return "Nunca";
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 30) return `Hace ${days} días`;
  return shortDate(value);
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "short",
  });
}

export function longDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Sellos en formato compacto para la lista: puntos, no la tarjeta entera.
 * El detalle usa `RewardGoalStamps`, que es exactamente lo que ve el cliente.
 */
export function StampDots({
  progress,
  target,
}: {
  progress: number;
  target: number;
}) {
  // Más de 8 sellos en una fila se vuelve ilegible en mobile: ahí solo el número.
  if (target > 8) {
    return (
      <span className="text-sm font-semibold text-[#202333]">
        {progress} de {target} sellos
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5"
      role="img"
      aria-label={`${progress} de ${target} sellos`}
    >
      {Array.from({ length: target }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full ${
            i < progress ? "bg-[#5C6BC0]" : "border border-[#D5D9E6] bg-white"
          }`}
        />
      ))}
    </span>
  );
}

export function Stars({ score }: { score: number }) {
  return (
    <span
      className="text-sm tracking-[0.1em] text-[#E8A317]"
      role="img"
      aria-label={`${score} de 5`}
    >
      {"★".repeat(Math.max(0, Math.min(5, score)))}
      <span className="text-[#DDE1EC]">
        {"★".repeat(Math.max(0, 5 - score))}
      </span>
    </span>
  );
}
