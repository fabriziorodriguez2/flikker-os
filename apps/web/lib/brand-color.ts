const GENERIC_BRAND_COLORS = new Set([
  "#5c6bc0",
  "#5b5bd6",
]);

const FALLBACK_PALETTES = [
  ["#0879B8", "#164365"],
  ["#7158C7", "#35305F"],
  ["#C25C43", "#613742"],
  ["#258A72", "#24534F"],
  ["#B56A22", "#674428"],
  ["#B14F7A", "#5A3155"],
  ["#4777B9", "#2D416B"],
  ["#6E8640", "#3C4B31"],
] as const;

function hashName(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getBusinessPalette(primaryColor: string | null, businessName: string) {
  const normalizedColor = primaryColor?.trim().toLowerCase();

  if (normalizedColor && !GENERIC_BRAND_COLORS.has(normalizedColor)) {
    return {
      primary: primaryColor as string,
      secondary: `color-mix(in srgb, ${primaryColor} 58%, #20233D)`,
    };
  }

  const [primary, secondary] =
    FALLBACK_PALETTES[hashName(businessName) % FALLBACK_PALETTES.length];

  return { primary, secondary };
}
