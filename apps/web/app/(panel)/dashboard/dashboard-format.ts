import type { PeriodChange } from "./dashboard-overview-types";

/** Formato humano de un cambio vs. período anterior. Nunca "+∞%": cuando el
 * período anterior fue 0, `percent` ya viene `null` desde el backend y acá
 * se usa una leyenda en su lugar. */
export function formatChange(change: PeriodChange): {
  text: string;
  variant: "positive" | "negative" | "neutral";
} {
  if (change.percent === null) {
    if (change.absolute > 0) {
      return { text: "nuevo vs. período anterior", variant: "positive" };
    }
    return { text: "sin datos del período anterior", variant: "neutral" };
  }
  if (change.percent > 0) {
    return { text: `↑ ${change.percent}% vs. período anterior`, variant: "positive" };
  }
  if (change.percent < 0) {
    return {
      text: `↓ ${Math.abs(change.percent)}% vs. período anterior`,
      variant: "negative",
    };
  }
  return { text: "igual que el período anterior", variant: "neutral" };
}

export function formatRelativeDate(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  if (hours < 48) return "ayer";
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export function n(value: number): string {
  return value.toLocaleString("es-UY");
}
