"use client";

import { useEffect, useMemo, useState } from "react";

export interface BrandPalette {
  primary: string;
  secondary: string;
  accent: string;
  accentText: "#171A2B" | "#FFFFFF";
}

function perceivedLightness(color: string): number {
  const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
  let [r, g, b] = values;
  if (color.startsWith("#") && color.length === 7) {
    r = Number.parseInt(color.slice(1, 3), 16);
    g = Number.parseInt(color.slice(3, 5), 16);
    b = Number.parseInt(color.slice(5, 7), 16);
  }
  if (![r, g, b].every(Number.isFinite)) return 0;
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function paletteFromColors(color: string, extractedAccent?: string | null): BrandPalette {
  const defaultAccent = perceivedLightness(color) > 185 ? "#171A2B" : "#F2C66D";
  const accent = extractedAccent ?? defaultAccent;
  return {
    primary: color,
    secondary: `color-mix(in srgb, ${color} 58%, #20233D)`,
    accent,
    accentText: perceivedLightness(accent) > 158 ? "#171A2B" : "#FFFFFF",
  };
}

function extractLogoColors(
  image: HTMLImageElement,
): { primary: string; accent: string | null } | null {
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

  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const dominant = ranked[0];
  if (!dominant) return null;

  const average = (bucket: (typeof ranked)[number]) => ({
    r: Math.round(bucket.r / bucket.count),
    g: Math.round(bucket.g / bucket.count),
    b: Math.round(bucket.b / bucket.count),
  });
  const primary = average(dominant);
  const alternate = ranked
    .slice(1)
    .map(average)
    .find((color) =>
      Math.hypot(
        color.r - primary.r,
        color.g - primary.g,
        color.b - primary.b,
      ) >= 92,
    );

  return {
    primary: `rgb(${primary.r} ${primary.g} ${primary.b})`,
    accent: alternate
      ? `rgb(${alternate.r} ${alternate.g} ${alternate.b})`
      : null,
  };
}

export function useLogoPalette(
  businessId: string,
  logoUrl: string | null,
  configuredColor: string | null,
): BrandPalette {
  return useImagePalette(
    `${businessId}:${logoUrl ?? ""}`,
    `/api/mi-flikker/places/${encodeURIComponent(businessId)}/logo`,
    logoUrl,
    configuredColor,
  );
}

export function useImagePalette(
  imageKey: string,
  imageSrc: string,
  logoUrl: string | null,
  configuredColor: string | null,
): BrandPalette {
  const fallback = configuredColor ?? "#596273";
  const logoKey = logoUrl ? imageKey : "";
  const [extracted, setExtracted] = useState<{
    key: string;
    colors: { primary: string; accent: string | null } | null;
  }>({
    key: "",
    colors: null,
  });

  useEffect(() => {
    if (!logoUrl) return;

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      try {
        setExtracted({ key: logoKey, colors: extractLogoColors(image) });
      } catch {
        setExtracted({ key: logoKey, colors: null });
      }
    };
    image.src = imageSrc;

    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [imageSrc, logoKey, logoUrl]);

  const logoColors = extracted.key === logoKey ? extracted.colors : null;
  return useMemo(
    () => paletteFromColors(logoColors?.primary ?? fallback, logoColors?.accent),
    [fallback, logoColors],
  );
}
