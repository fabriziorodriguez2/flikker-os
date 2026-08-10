"use client";

import { useEffect, useMemo, useState } from "react";

interface BrandPalette {
  primary: string;
  secondary: string;
}

function paletteFromColor(color: string): BrandPalette {
  return {
    primary: color,
    secondary: `color-mix(in srgb, ${color} 58%, #20233D)`,
  };
}

function dominantLogoColor(image: HTMLImageElement): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

  for (let index = 0; index < pixels.length; index += 16) {
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const alpha = pixels[index + 3];
    if (alpha < 160 || (r > 238 && g > 238 && b > 238)) continue;

    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return null;

  const r = Math.round(dominant.r / dominant.count);
  const g = Math.round(dominant.g / dominant.count);
  const b = Math.round(dominant.b / dominant.count);
  return `rgb(${r} ${g} ${b})`;
}

export function useLogoPalette(
  businessId: string,
  logoUrl: string | null,
  configuredColor: string | null,
): BrandPalette {
  const fallback = configuredColor ?? "#596273";
  const logoKey = logoUrl ? `${businessId}:${logoUrl}` : "";
  const [extracted, setExtracted] = useState<{ key: string; color: string | null }>({
    key: "",
    color: null,
  });

  useEffect(() => {
    if (!logoUrl) return;

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      try {
        setExtracted({ key: logoKey, color: dominantLogoColor(image) });
      } catch {
        setExtracted({ key: logoKey, color: null });
      }
    };
    image.src = `/api/mi-flikker/places/${encodeURIComponent(businessId)}/logo`;

    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [businessId, logoKey, logoUrl]);

  const logoColor = extracted.key === logoKey ? extracted.color : null;
  return useMemo(() => paletteFromColor(logoColor ?? fallback), [fallback, logoColor]);
}
