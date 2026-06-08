"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Save } from "lucide-react";
import QRCode from "qrcode";

// ─── Constants ────────────────────────────────────────────────────────────────

const QR_BASE_URL = "https://flikker.site/qr";
const DEFAULT_COLOR = "#9188F5";
const DEFAULT_BENEFIT = "10% de descuento en tu próxima visita";
const DEFAULT_MAIN_TEXT = "Escaneá y llevate";
const DEFAULT_A4_TITLE = "¿Querés un regalo?";
const DEFAULT_A4_SUBTITLE = "Beneficios exclusivos para vos";
const MAX_BENEFIT_LEN = 60;
const MAX_MAIN_LEN = 30;
const MAX_A4_TITLE_LEN = 40;
const MAX_A4_SUBTITLE_LEN = 60;

type Version = "mesa" | "mostrador" | "sticker" | "a4";

const PRINT_DIMS: Record<Version, { w: number; h: number }> = {
  mesa: { w: 100, h: 100 },
  mostrador: { w: 100, h: 150 },
  sticker: { w: 60, h: 60 },
  a4: { w: 210, h: 297 },
};

const A4_W = 794;
const A4_H = 1123;
const A4_SCALE = 0.5;

// ─── Types ────────────────────────────────────────────────────────────────────

interface BusinessData {
  id: string;
  name?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  benefitText?: string | null;
  qrA4Title?: string | null;
  qrA4Subtitle?: string | null;
  qrA4BgColor?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function darkenHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const FLIKKER_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 516.34 402.58"><polygon fill="#9188F5" points="169.64 200.96 214.33 149.16 173.32 101.62 0 302.58 86.22 402.58 173.32 301.6 260.42 402.58 346.69 302.58 300.58 249.13 255.86 300.95 169.64 200.96"/><polygon fill="#9188F5" points="430.11 300.95 516.34 200.96 342.99 0 214.33 149.16 300.58 249.13 342.99 199.96 430.11 300.95"/></svg>`;
const FLIKKER_MARK_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(FLIKKER_MARK_SVG)}`;

// ─── QR generation ────────────────────────────────────────────────────────────

async function generateQrDataUrl(businessId: string, color: string): Promise<string> {
  const url = `${QR_BASE_URL}/${businessId}`;
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 800;
  await QRCode.toCanvas(canvas, url, {
    errorCorrectionLevel: "H",
    margin: 3,
    width: 800,
    color: { dark: color, light: "#ffffff" },
  });
  return canvas.toDataURL("image/png");
}

function clipRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function generateStickerQrDataUrl(
  businessId: string,
  color: string,
  logoUrl: string | null,
): Promise<string> {
  const url = `${QR_BASE_URL}/${businessId}`;
  const size = 800;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  await QRCode.toCanvas(canvas, url, {
    errorCorrectionLevel: "H",
    margin: 3,
    width: size,
    color: { dark: color, light: "#ffffff" },
  });

  const ctx = canvas.getContext("2d")!;
  const logoLinear = Math.round(size * 0.25);
  const padding = 6;
  const boxSize = logoLinear + padding * 2;
  const boxX = (size - boxSize) / 2;
  const boxY = (size - boxSize) / 2;

  // White rounded background behind logo
  ctx.save();
  clipRoundRect(ctx, boxX, boxY, boxSize, boxSize, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  const imageUrl = logoUrl ?? FLIKKER_MARK_DATA_URL;
  try {
    const img = await loadImage(imageUrl);
    const scale = Math.min(logoLinear / img.width, logoLinear / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, boxX + padding + (logoLinear - w) / 2, boxY + padding + (logoLinear - h) / 2, w, h);
  } catch {
    // Cross-origin failed — try Flikker fallback
    if (logoUrl) {
      try {
        const fallback = await loadImage(FLIKKER_MARK_DATA_URL);
        ctx.drawImage(fallback, boxX + padding, boxY + padding, logoLinear, logoLinear);
      } catch { /* silent — QR still works without logo */ }
    }
  }

  return canvas.toDataURL("image/png");
}

// ─── Shared UI pieces ─────────────────────────────────────────────────────────

function FlikkerMark({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 516.34 402.58"
      style={{ fill: "currentColor", flexShrink: 0, display: "block", ...style }}
    >
      <polygon points="169.64 200.96 214.33 149.16 173.32 101.62 0 302.58 86.22 402.58 173.32 301.6 260.42 402.58 346.69 302.58 300.58 249.13 255.86 300.95 169.64 200.96" />
      <polygon points="430.11 300.95 516.34 200.96 342.99 0 214.33 149.16 300.58 249.13 342.99 199.96 430.11 300.95" />
    </svg>
  );
}

function PoweredBy({
  color = "#C8D0E0",
  fontSize = 9,
  iconHeight = 12,
}: {
  color?: string;
  fontSize?: number;
  iconHeight?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, color }}>
      <FlikkerMark style={{ height: iconHeight, width: "auto" }} />
      <span style={{ fontSize, margin: 0, lineHeight: 1 }}>Powered by Flikker</span>
    </div>
  );
}

// ─── Preview components ──────────────────────────────────────────────────────

function MesaPreview({
  business, color, mainText, benefitText, qrDataUrl,
}: {
  business: BusinessData; color: string; mainText: string; benefitText: string; qrDataUrl: string | null;
}) {
  return (
    <div style={{ width: 360, height: 360, background: "#ffffff", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
      <div style={{ background: color, height: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
        {business.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logoUrl} alt={business.name} style={{ maxHeight: 64, maxWidth: 180, objectFit: "contain" }} />
        ) : (
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 18, textAlign: "center" }}>{business.name}</span>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 20px 8px", gap: 6 }}>
        <p style={{ fontSize: 12, color: "#8891A4", margin: 0, textAlign: "center" }}>
          {mainText || DEFAULT_MAIN_TEXT}
        </p>
        <p style={{ fontSize: 14, fontWeight: 700, color, margin: 0, textAlign: "center", lineHeight: 1.3 }}>
          {benefitText || DEFAULT_BENEFIT}
        </p>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR" style={{ width: 140, height: 140, marginTop: 4 }} />
        ) : (
          <div style={{ width: 140, height: 140, background: "#F0F2FA", borderRadius: 8, marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#8891A4" }}>
            Generando…
          </div>
        )}
      </div>
      <div style={{ padding: "0 0 8px" }}>
        <PoweredBy />
      </div>
    </div>
  );
}

function MostradorPreview({
  business, color, mainText, benefitText, qrDataUrl,
}: {
  business: BusinessData; color: string; mainText: string; benefitText: string; qrDataUrl: string | null;
}) {
  return (
    <div style={{ width: 240, height: 400, background: color, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 20px 12px", gap: 10, boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}>
      <p style={{ color: "#fff", fontWeight: 800, fontSize: 20, margin: 0, textAlign: "center", lineHeight: 1.2 }}>
        {mainText || DEFAULT_A4_TITLE}
      </p>
      <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: 0, textAlign: "center", lineHeight: 1.4 }}>
        {benefitText || DEFAULT_BENEFIT}
      </p>
      <div style={{ background: "#fff", borderRadius: 12, padding: 10, marginTop: 4 }}>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR" style={{ width: 130, height: 130, display: "block" }} />
        ) : (
          <div style={{ width: 130, height: 130, background: "#F0F2FA", borderRadius: 8 }} />
        )}
      </div>
      <div style={{ marginTop: "auto" }}>
        {business.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logoUrl} alt={business.name} style={{ maxHeight: 32, maxWidth: 120, objectFit: "contain", filter: "brightness(10)" }} />
        ) : (
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 600 }}>{business.name}</span>
        )}
      </div>
      <PoweredBy color="rgba(255,255,255,0.4)" />
    </div>
  );
}

function StickerPreview({
  color, stickerQrDataUrl,
}: {
  color: string; stickerQrDataUrl: string | null;
}) {
  return (
    <div style={{ width: 240, height: 240, background: "#ffffff", borderRadius: 12, border: `4px solid ${color}`, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 14, gap: 6, boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}>
      {stickerQrDataUrl ? (
        <img src={stickerQrDataUrl} alt="QR" style={{ width: 196, height: 196 }} />
      ) : (
        <div style={{ width: 196, height: 196, background: "#F0F2FA", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#8891A4" }}>
          Generando…
        </div>
      )}
      <PoweredBy color="#C8D0E0" fontSize={8} iconHeight={10} />
    </div>
  );
}

function A4Preview({
  business, bgColor, qrDataUrl, a4Title, a4Subtitle, mainText, benefitText,
}: {
  business: BusinessData; bgColor: string; qrDataUrl: string | null;
  a4Title: string; a4Subtitle: string; mainText: string; benefitText: string;
}) {
  // iPhone screen: use a dark variant of bgColor, floor at #1a1a1a so pure black stays visible
  const screenBg = bgColor.toLowerCase() === "#000000"
    ? "#1a1a1a"
    : darkenHex(bgColor, 0.20);

  return (
    <div style={{
      width: A4_W, height: A4_H,
      background: bgColor,
      position: "relative",
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflow: "visible",
    }}>
      {/* ── Top zone (35% = 393px): title + subtitle ── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 393,
        padding: "40px 48px 0",
      }}>
        <h1 style={{
          fontSize: 72, fontWeight: 900, color: "#ffffff",
          margin: 0, lineHeight: 1.1, textAlign: "left",
        }}>
          {a4Title || DEFAULT_A4_TITLE}
        </h1>
        <p style={{
          fontSize: 28, fontWeight: 400, color: "#ffffff",
          margin: "24px 0 0", textAlign: "center", lineHeight: 1.3,
        }}>
          {a4Subtitle || DEFAULT_A4_SUBTITLE}
        </p>
      </div>

      {/* ── Bottom zone (65% = 730px): iPhone mockup ── */}
      <div style={{
        position: "absolute", top: 393, left: 0, right: 0, bottom: 0,
        display: "flex", justifyContent: "center", alignItems: "flex-start",
        overflow: "visible",
      }}>
        {/* iPhone wrapper — position:relative anchors the screen overlay */}
        <div style={{ position: "relative", width: Math.round(A4_W * 0.65), flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/iphone-mockup.png"
            alt=""
            crossOrigin="anonymous"
            style={{ width: "100%", height: "auto", display: "block" }}
          />

          {/* Screen overlay — covers the iPhone display area */}
          <div style={{
            position: "absolute",
            top: "15%", left: "11%",
            width: "78%", height: "72%",
            background: screenBg,
            borderRadius: 8,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "20px 16px",
            overflow: "hidden",
          }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", margin: 0, textAlign: "center" }}>
              {mainText || DEFAULT_MAIN_TEXT}
            </p>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.85)", margin: "8px 0 0", textAlign: "center", lineHeight: 1.4 }}>
              {benefitText || DEFAULT_BENEFIT}
            </p>
            <div style={{ marginTop: 20, background: "#ffffff", borderRadius: 12, padding: 12 }}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR" style={{ width: 160, height: 160, display: "block" }} />
              ) : (
                <div style={{ width: 160, height: 160, background: "#F0F2FA", borderRadius: 8 }} />
              )}
            </div>
            <div style={{ marginTop: 16 }}>
              {business.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={business.logoUrl}
                  alt={business.name}
                  crossOrigin="anonymous"
                  style={{ height: 28, maxWidth: 120, objectFit: "contain", filter: "brightness(0) invert(1)" }}
                />
              ) : (
                <span style={{ fontSize: 16, fontWeight: 700, color: "#ffffff" }}>{business.name}</span>
              )}
            </div>
            <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
              <PoweredBy color="rgba(255,255,255,0.4)" fontSize={11} iconHeight={13} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Download helpers (html2canvas → identical to preview) ────────────────────

async function capturePreview(version: Version): Promise<HTMLCanvasElement | null> {
  const elementId = version === "a4" ? "qr-preview-a4" : "qr-preview-card";
  const element = document.getElementById(elementId);
  if (!element) return null;
  const html2canvas = (await import("html2canvas")).default;
  return html2canvas(element, {
    scale: 3,
    useCORS: true,
    allowTaint: false,
    ...(version === "a4"
      ? { width: A4_W, height: A4_H }
      : { backgroundColor: "#ffffff" }),
  });
}

async function downloadPng(businessName: string, version: Version) {
  const canvas = await capturePreview(version);
  if (!canvas) return;
  const safeName = businessName.toLowerCase().replace(/\s+/g, "-");
  const link = document.createElement("a");
  link.download = `flikker-qr-${safeName}-${version}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function downloadPdf(businessName: string, version: Version) {
  const canvas = await capturePreview(version);
  if (!canvas) return;
  const imgData = canvas.toDataURL("image/png");
  const { jsPDF } = await import("jspdf");
  const dims = PRINT_DIMS[version];
  const doc = new jsPDF({
    orientation: dims.w > dims.h ? "landscape" : "portrait",
    unit: "mm",
    format: [dims.w, dims.h],
  });
  const canvasAspect = canvas.height / canvas.width;
  let imgW = dims.w;
  let imgH = dims.w * canvasAspect;
  if (imgH > dims.h) {
    imgH = dims.h;
    imgW = dims.h / canvasAspect;
  }
  const offsetX = (dims.w - imgW) / 2;
  const offsetY = (dims.h - imgH) / 2;
  doc.addImage(imgData, "PNG", offsetX, offsetY, imgW, imgH);
  const safeName = businessName.toLowerCase().replace(/\s+/g, "-");
  doc.save(`flikker-qr-${safeName}-${version}.pdf`);
}

// ─── Main page ────────────────────────────────────────────────────────────────

const VERSION_TABS: Array<{ key: Version; label: string }> = [
  { key: "mesa", label: "Mesa" },
  { key: "mostrador", label: "Mostrador" },
  { key: "sticker", label: "Sticker" },
];

const PREVIEW_LABEL: Record<Version, string> = {
  mesa: "Mesa (10×10 cm)",
  mostrador: "Mostrador (10×15 cm)",
  sticker: "Sticker (6×6 cm)",
  a4: "Cartel A4 (21×29.7 cm)",
};

export default function QrPage() {
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Config state
  const [version, setVersion] = useState<Version>("mesa");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [benefitText, setBenefitText] = useState("");
  const [mainText, setMainText] = useState(DEFAULT_MAIN_TEXT);
  const [a4Title, setA4Title] = useState(DEFAULT_A4_TITLE);
  const [a4Subtitle, setA4Subtitle] = useState(DEFAULT_A4_SUBTITLE);
  const [a4BgColor, setA4BgColor] = useState("#000000");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  // Generated QRs
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [stickerQrDataUrl, setStickerQrDataUrl] = useState<string | null>(null);
  const generatingRef = useRef(false);
  const generatingStickerRef = useRef(false);

  // Saving / downloading state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const regenerateQr = useCallback(async (bizId: string, qrColor: string) => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    try {
      setQrDataUrl(await generateQrDataUrl(bizId, qrColor));
    } finally {
      generatingRef.current = false;
    }
  }, []);

  const regenerateStickerQr = useCallback(async (
    bizId: string, qrColor: string, logo: string | null,
  ) => {
    if (generatingStickerRef.current) return;
    generatingStickerRef.current = true;
    try {
      setStickerQrDataUrl(await generateStickerQrDataUrl(bizId, qrColor, logo));
    } finally {
      generatingStickerRef.current = false;
    }
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/proxy/businesses/current");
        if (!res.ok) throw new Error("Error al cargar el negocio");
        const biz = (await res.json()) as BusinessData;

        setBusiness(biz);
        const initColor = biz.primaryColor ?? DEFAULT_COLOR;
        setColor(initColor);
        setBenefitText(biz.benefitText ?? "");
        setA4Title(biz.qrA4Title ?? DEFAULT_A4_TITLE);
        setA4Subtitle(biz.qrA4Subtitle ?? DEFAULT_A4_SUBTITLE);
        setA4BgColor(biz.qrA4BgColor ?? "#000000");
        if (biz.logoUrl) setLogoPreviewUrl(biz.logoUrl);

        void regenerateQr(biz.id, initColor);
        void regenerateStickerQr(biz.id, initColor, biz.logoUrl ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [regenerateQr, regenerateStickerQr]);

  // Regenerate QRs when color or logo changes
  useEffect(() => {
    if (!business) return;
    const t = setTimeout(() => {
      void regenerateQr(business.id, color);
      void regenerateStickerQr(business.id, color, logoPreviewUrl);
    }, 300);
    return () => clearTimeout(t);
  }, [color, logoPreviewUrl, business, regenerateQr, regenerateStickerQr]);

  function handleLogoFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      alert("El logo no puede superar 2 MB");
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setLogoPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!business) return;
    setSaving(true);
    try {
      const payload =
        version === "a4"
          ? { qrA4Title: a4Title, qrA4Subtitle: a4Subtitle, qrA4BgColor: a4BgColor, benefitText }
          : { benefitText };
      await fetch("/api/proxy/businesses/current/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPdf() {
    if (!business) return;
    setDownloading(true);
    try {
      await downloadPdf(business.name ?? "negocio", version);
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadPng() {
    if (!business) return;
    await downloadPng(business.name ?? "negocio", version);
  }

  const displayBusiness: BusinessData = {
    ...(business ?? { id: "", name: "" }),
    logoUrl: logoPreviewUrl ?? business?.logoUrl ?? null,
  };

  const isA4 = version === "a4";
  const qrReady = version === "sticker" ? !!stickerQrDataUrl : !!qrDataUrl;

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[#8891A4]">
        Cargando…
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
        {error ?? "Error al cargar el negocio"}
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">Tu QR de captación</h1>
        <p className="mt-1 text-sm text-[#8891A4]">
          Personalizá el diseño y descargá el PDF listo para imprimir.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* ── Config panel ─────────────────────────────────────── */}
        <div className="space-y-5 lg:w-80 lg:shrink-0">

          {/* Version tabs */}
          <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Versión del diseño
            </p>
            <div className="grid grid-cols-2 gap-2">
              {VERSION_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setVersion(tab.key)}
                  className={`rounded-[8px] px-3 py-2 text-sm font-semibold transition-colors ${
                    version === tab.key
                      ? "bg-[#5C6BC0] text-white"
                      : "border border-[#E8EAF0] bg-white text-[#8891A4] hover:border-[#5C6BC0] hover:text-[#5C6BC0]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* A4-specific content fields */}
          {isA4 && (
            <div className="space-y-3 rounded-[12px] border border-[#E8EAF0] bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Texto del cartel
              </p>
              <div>
                <label className="block text-xs font-medium text-[#4A5568]">Título</label>
                <input
                  type="text"
                  value={a4Title}
                  onChange={(e) => setA4Title(e.target.value.slice(0, MAX_A4_TITLE_LEN))}
                  placeholder={DEFAULT_A4_TITLE}
                  className="mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
                />
                <span className="mt-0.5 block text-right text-[11px] text-[#B0B8C9]">
                  {a4Title.length}/{MAX_A4_TITLE_LEN}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5568]">Subtítulo</label>
                <input
                  type="text"
                  value={a4Subtitle}
                  onChange={(e) => setA4Subtitle(e.target.value.slice(0, MAX_A4_SUBTITLE_LEN))}
                  placeholder={DEFAULT_A4_SUBTITLE}
                  className="mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
                />
                <span className="mt-0.5 block text-right text-[11px] text-[#B0B8C9]">
                  {a4Subtitle.length}/{MAX_A4_SUBTITLE_LEN}
                </span>
              </div>

              <p className="pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Pantalla del iPhone
              </p>
              <div>
                <label className="block text-xs font-medium text-[#4A5568]">Texto principal</label>
                <input
                  type="text"
                  value={mainText}
                  onChange={(e) => setMainText(e.target.value.slice(0, MAX_MAIN_LEN))}
                  placeholder={DEFAULT_MAIN_TEXT}
                  className="mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
                />
                <span className="mt-0.5 block text-right text-[11px] text-[#B0B8C9]">
                  {mainText.length}/{MAX_MAIN_LEN}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5568]">Texto del beneficio</label>
                <textarea
                  value={benefitText}
                  onChange={(e) => setBenefitText(e.target.value.slice(0, MAX_BENEFIT_LEN))}
                  placeholder={DEFAULT_BENEFIT}
                  rows={2}
                  className="mt-1 w-full resize-none rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
                />
                <span className="mt-0.5 block text-right text-[11px] text-[#B0B8C9]">
                  {benefitText.length}/{MAX_BENEFIT_LEN}
                </span>
              </div>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex w-full items-center justify-center gap-1 rounded-[8px] border border-[#E8EAF0] py-2 text-xs font-medium text-[#5C6BC0] hover:bg-[#F5F6FA] disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                {saved ? "¡Guardado!" : "Guardar como predeterminado"}
              </button>
            </div>
          )}

          {/* Mesa / Mostrador / Sticker text fields */}
          {!isA4 && (
            <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-4">
              <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Texto principal
              </label>
              <input
                type="text"
                value={mainText}
                onChange={(e) => setMainText(e.target.value.slice(0, MAX_MAIN_LEN))}
                placeholder={DEFAULT_MAIN_TEXT}
                className="mt-2 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
              />
              <span className="mt-1 block text-right text-[11px] text-[#B0B8C9]">
                {mainText.length}/{MAX_MAIN_LEN}
              </span>

              <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                ¿Qué le ofrecés al cliente?
              </label>
              <textarea
                value={benefitText}
                onChange={(e) => setBenefitText(e.target.value.slice(0, MAX_BENEFIT_LEN))}
                placeholder={DEFAULT_BENEFIT}
                rows={3}
                className="mt-2 w-full resize-none rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-xs text-[#B0B8C9]">
                  {benefitText.length} / {MAX_BENEFIT_LEN}
                </span>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs font-medium text-[#5C6BC0] hover:underline disabled:opacity-50"
                >
                  <Save className="h-3 w-3" />
                  {saved ? "¡Guardado!" : "Guardar como predeterminado"}
                </button>
              </div>
            </div>
          )}

          {/* Color picker */}
          <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-4">
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              {isA4 ? "Color de fondo" : "Color del diseño"}
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={isA4 ? a4BgColor : color}
                onChange={(e) => isA4 ? setA4BgColor(e.target.value) : setColor(e.target.value)}
                className="h-10 w-10 cursor-pointer rounded-[8px] border border-[#E8EAF0] p-0.5"
              />
              <span className="font-mono text-sm font-semibold text-[#1A202C]">
                {(isA4 ? a4BgColor : color).toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() =>
                  isA4
                    ? setA4BgColor("#000000")
                    : setColor(business.primaryColor ?? DEFAULT_COLOR)
                }
                className="ml-auto text-xs text-[#8891A4] hover:text-[#1A202C]"
              >
                Restablecer
              </button>
            </div>
          </div>

          {/* Logo */}
          <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Logo del negocio
            </p>
            <div className="mt-3 flex items-center gap-3">
              {logoPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreviewUrl}
                  alt="Logo"
                  className="h-12 w-12 rounded-[8px] border border-[#E8EAF0] object-contain p-1"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-[8px] border border-dashed border-[#E8EAF0] bg-[#F5F6FA] text-xs text-[#8891A4]">
                  Sin logo
                </div>
              )}
              <label className="cursor-pointer text-xs font-semibold text-[#5C6BC0] hover:underline">
                {logoPreviewUrl ? "Cambiar logo" : "Subir logo (opcional)"}
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.svg"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleLogoFile(f);
                  }}
                />
              </label>
              {(logoFile ?? logoPreviewUrl) ? (
                <button
                  type="button"
                  onClick={() => {
                    setLogoFile(null);
                    setLogoPreviewUrl(null);
                  }}
                  className="ml-auto text-xs text-[#8891A4] hover:text-[#C0392B]"
                >
                  Quitar
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] text-[#B0B8C9]">PNG, JPG o SVG · máx 2 MB</p>
          </div>

          {/* Download buttons */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={!qrReady || downloading}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[10px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {downloading ? "Generando PDF…" : "Descargar PDF"}
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadPng()}
              disabled={!qrReady}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[10px] border border-[#E8EAF0] bg-white px-5 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Descargar PNG
            </button>
            <p className="text-center text-[11px] text-[#B0B8C9]">
              PDF listo para imprimir · PNG para compartir digitalmente
            </p>
          </div>
        </div>

        {/* ── Preview ──────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col items-center gap-4">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Preview — {PREVIEW_LABEL[version]}
          </span>

          {isA4 ? (
            /* A4: scaled-down visible preview (CSS transform, not captured by html2canvas) */
            <div
              style={{
                width: Math.round(A4_W * A4_SCALE),
                height: Math.round(A4_H * A4_SCALE),
                position: "relative",
                overflow: "hidden",
                borderRadius: 8,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: `scale(${A4_SCALE})`,
                  transformOrigin: "top left",
                  pointerEvents: "none",
                }}
              >
                <A4Preview
                  business={displayBusiness}
                  bgColor={a4BgColor}
                  qrDataUrl={qrDataUrl}
                  a4Title={a4Title}
                  a4Subtitle={a4Subtitle}
                  mainText={mainText}
                  benefitText={benefitText}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-[16px] bg-[#F0F2FA] p-8">
              <div id="qr-preview-card" style={{ display: "inline-block" }}>
                {version === "mesa" ? (
                  <MesaPreview
                    business={displayBusiness}
                    color={color}
                    mainText={mainText}
                    benefitText={benefitText}
                    qrDataUrl={qrDataUrl}
                  />
                ) : version === "mostrador" ? (
                  <MostradorPreview
                    business={displayBusiness}
                    color={color}
                    mainText={mainText}
                    benefitText={benefitText}
                    qrDataUrl={qrDataUrl}
                  />
                ) : (
                  <StickerPreview
                    color={color}
                    stickerQrDataUrl={stickerQrDataUrl}
                  />
                )}
              </div>
            </div>
          )}

          <p className="max-w-[300px] text-center text-xs text-[#B0B8C9]">
            La preview es representativa. El PDF descargado estará optimizado para impresión a 300 DPI.
          </p>
        </div>
      </div>

      {/* Hidden full-size A4 element — captured by html2canvas for download */}
      {isA4 && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: "-9999px",
            width: A4_W,
            height: A4_H,
            overflow: "visible",
            pointerEvents: "none",
            zIndex: -1,
          }}
        >
          <div id="qr-preview-a4">
            <A4Preview
              business={displayBusiness}
              bgColor={a4BgColor}
              qrDataUrl={qrDataUrl}
              a4Title={a4Title}
              a4Subtitle={a4Subtitle}
              mainText={mainText}
              benefitText={benefitText}
            />
          </div>
        </div>
      )}
    </div>
  );
}
