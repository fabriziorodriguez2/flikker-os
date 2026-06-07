"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Save } from "lucide-react";
import QRCode from "qrcode";

// ─── Constants ────────────────────────────────────────────────────────────────

const QR_BASE_URL = "https://flikker.site/qr";
const DEFAULT_COLOR = "#9188F5";
const DEFAULT_BENEFIT = "10% de descuento en tu próxima visita";
const MAX_BENEFIT_LEN = 60;

type Version = "mesa" | "mostrador" | "sticker";

// Print dimensions in mm at 300 DPI
const PRINT_DIMS: Record<Version, { w: number; h: number }> = {
  mesa: { w: 100, h: 100 },
  mostrador: { w: 100, h: 150 },
  sticker: { w: 60, h: 60 },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface BusinessData {
  id: string;
  name?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  benefitText?: string | null;
}

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

// ─── Preview components ──────────────────────────────────────────────────────

function MesaPreview({
  business,
  color,
  benefitText,
  qrDataUrl,
}: {
  business: BusinessData;
  color: string;
  benefitText: string;
  qrDataUrl: string | null;
}) {
  return (
    <div
      style={{
        width: 360,
        height: 360,
        background: "#ffffff",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
      }}
    >
      {/* Header band */}
      <div
        style={{
          background: color,
          height: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 20px",
        }}
      >
        {business.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={business.logoUrl}
            alt={business.name}
            style={{ maxHeight: 64, maxWidth: 180, objectFit: "contain" }}
          />
        ) : (
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 18, textAlign: "center" }}>
            {business.name}
          </span>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px 20px 8px",
          gap: 6,
        }}
      >
        <p style={{ fontSize: 12, color: "#8891A4", margin: 0, textAlign: "center" }}>
          Escaneá y llevate
        </p>
        <p
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: color,
            margin: 0,
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          {benefitText || DEFAULT_BENEFIT}
        </p>

        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR"
            style={{ width: 140, height: 140, marginTop: 4 }}
          />
        ) : (
          <div
            style={{
              width: 140,
              height: 140,
              background: "#F0F2FA",
              borderRadius: 8,
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color: "#8891A4",
            }}
          >
            Generando…
          </div>
        )}
      </div>

      {/* Footer */}
      <p style={{ fontSize: 9, color: "#C8D0E0", textAlign: "center", padding: "0 0 8px", margin: 0 }}>
        Powered by Flikker
      </p>
    </div>
  );
}

function MostradorPreview({
  business,
  color,
  benefitText,
  qrDataUrl,
}: {
  business: BusinessData;
  color: string;
  benefitText: string;
  qrDataUrl: string | null;
}) {
  return (
    <div
      style={{
        width: 240,
        height: 380,
        background: color,
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "28px 20px 16px",
        gap: 12,
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
      }}
    >
      {/* Heading */}
      <p style={{ color: "#fff", fontWeight: 800, fontSize: 20, margin: 0, textAlign: "center", lineHeight: 1.2 }}>
        ¿Querés un regalo?
      </p>
      <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: 0, textAlign: "center", lineHeight: 1.4 }}>
        {benefitText || DEFAULT_BENEFIT}
      </p>

      {/* QR on white */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 10,
          marginTop: 4,
        }}
      >
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR" style={{ width: 130, height: 130, display: "block" }} />
        ) : (
          <div style={{ width: 130, height: 130, background: "#F0F2FA", borderRadius: 8 }} />
        )}
      </div>

      {/* Logo or name */}
      <div style={{ marginTop: "auto" }}>
        {business.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={business.logoUrl}
            alt={business.name}
            style={{ maxHeight: 32, maxWidth: 120, objectFit: "contain", filter: "brightness(10)" }}
          />
        ) : (
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 600 }}>
            {business.name}
          </span>
        )}
      </div>
    </div>
  );
}

function StickerPreview({
  business,
  color,
  qrDataUrl,
}: {
  business: BusinessData;
  color: string;
  qrDataUrl: string | null;
}) {
  return (
    <div
      style={{
        width: 240,
        height: 240,
        background: "#ffffff",
        borderRadius: 12,
        border: `4px solid ${color}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
        gap: 8,
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
      }}
    >
      {qrDataUrl ? (
        <img src={qrDataUrl} alt="QR" style={{ width: 168, height: 168 }} />
      ) : (
        <div style={{ width: 168, height: 168, background: "#F0F2FA", borderRadius: 8 }} />
      )}

      {business.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={business.logoUrl}
          alt={business.name}
          style={{ maxHeight: 22, maxWidth: 100, objectFit: "contain" }}
        />
      ) : (
        <span style={{ fontSize: 10, color: "#8891A4", fontWeight: 600 }}>{business.name}</span>
      )}
    </div>
  );
}

// ─── PDF generation ───────────────────────────────────────────────────────────

async function downloadPdf(
  business: BusinessData,
  version: Version,
  color: string,
  benefitText: string,
  qrDataUrl: string,
) {
  const { jsPDF } = await import("jspdf");
  const dims = PRINT_DIMS[version];
  const doc = new jsPDF({ orientation: dims.w > dims.h ? "landscape" : "portrait", unit: "mm", format: [dims.w, dims.h] });

  const W = dims.w;
  const H = dims.h;

  // Helper: hex to r,g,b
  function hexRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const [cr, cg, cb] = hexRgb(color);

  if (version === "mesa") {
    // White background
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, H, "F");

    // Header band
    doc.setFillColor(cr, cg, cb);
    doc.rect(0, 0, W, H * 0.28, "F");

    // Business name in header
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const nameLines = doc.splitTextToSize(business.name ?? "", W - 10);
    doc.text(nameLines, W / 2, H * 0.14 + 2, { align: "center" });

    // "Escaneá y llevate"
    doc.setTextColor(136, 145, 164);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Escaneá y llevate", W / 2, H * 0.36, { align: "center" });

    // Benefit text
    doc.setTextColor(cr, cg, cb);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const benefitLines = doc.splitTextToSize(benefitText || DEFAULT_BENEFIT, W - 12);
    doc.text(benefitLines, W / 2, H * 0.44, { align: "center" });

    // QR — centered, 50mm wide
    const qrSize = 50;
    const qrX = (W - qrSize) / 2;
    const qrY = H * 0.5;
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    // Footer
    doc.setTextColor(200, 208, 224);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text("Powered by Flikker", W / 2, H - 3, { align: "center" });
  } else if (version === "mostrador") {
    // Colored background
    doc.setFillColor(cr, cg, cb);
    doc.rect(0, 0, W, H, "F");

    // "¿Querés un regalo?"
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    const heading = doc.splitTextToSize("¿Querés un regalo?", W - 14);
    doc.text(heading, W / 2, 22, { align: "center" });

    // Benefit text
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(255, 255, 255, 0.85);
    const bLines = doc.splitTextToSize(benefitText || DEFAULT_BENEFIT, W - 14);
    doc.text(bLines, W / 2, 38, { align: "center" });

    // White QR box
    const qrSize = 60;
    const qrX = (W - qrSize) / 2;
    const qrY = 50;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 4, 4, "F");
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    // Business name at bottom
    doc.setTextColor(255, 255, 255, 0.7);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(business.name ?? "", W / 2, H - 6, { align: "center" });
  } else {
    // Sticker — white with colored border
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, H, "F");
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(1.5);
    doc.rect(1, 1, W - 2, H - 2);

    // QR centered, 70% of space
    const qrSize = W * 0.7;
    const qrX = (W - qrSize) / 2;
    const qrY = (H - qrSize) / 2 - 4;
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    // Business name below QR
    doc.setTextColor(136, 145, 164);
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.text(business.name ?? "", W / 2, qrY + qrSize + 5, { align: "center" });
  }

  const safeName = (business.name ?? "negocio").toLowerCase().replace(/\s+/g, "-");
  doc.save(`flikker-qr-${safeName}-${version}.pdf`);
}

async function downloadPng(
  business: BusinessData,
  version: Version,
  qrDataUrl: string,
) {
  const safeName = (business.name ?? "negocio").toLowerCase().replace(/\s+/g, "-");
  const link = document.createElement("a");
  link.href = qrDataUrl;
  link.download = `flikker-qr-${safeName}-${version}.png`;
  link.click();
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QrPage() {
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Config state
  const [version, setVersion] = useState<Version>("mesa");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [benefitText, setBenefitText] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  // Generated QR
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const generatingRef = useRef(false);

  // Saving state
  const [savingBenefit, setSavingBenefit] = useState(false);
  const [savedBenefit, setSavedBenefit] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Regenerate QR when color changes
  const regenerateQr = useCallback(async (bizId: string, qrColor: string) => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    try {
      const url = await generateQrDataUrl(bizId, qrColor);
      setQrDataUrl(url);
    } finally {
      generatingRef.current = false;
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
        if (biz.logoUrl) setLogoPreviewUrl(biz.logoUrl);

        void regenerateQr(biz.id, initColor);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [regenerateQr]);

  // Regenerate QR on color change (debounced slightly)
  useEffect(() => {
    if (!business) return;
    const t = setTimeout(() => void regenerateQr(business.id, color), 300);
    return () => clearTimeout(t);
  }, [color, business, regenerateQr]);

  // Logo file handling
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

  async function handleSaveBenefit() {
    if (!business) return;
    setSavingBenefit(true);
    try {
      await fetch("/api/proxy/businesses/current/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benefitText }),
      });
      setSavedBenefit(true);
      setTimeout(() => setSavedBenefit(false), 2500);
    } finally {
      setSavingBenefit(false);
    }
  }

  async function handleDownloadPdf() {
    if (!business || !qrDataUrl) return;
    setDownloading(true);
    try {
      await downloadPdf(business, version, color, benefitText, qrDataUrl);
    } finally {
      setDownloading(false);
    }
  }

  function handleDownloadPng() {
    if (!business || !qrDataUrl) return;
    void downloadPng(business, version, qrDataUrl);
  }

  const displayBusiness: BusinessData = {
    ...(business ?? { id: "", name: "" }),
    logoUrl: logoPreviewUrl ?? business?.logoUrl ?? null,
  };

  const VERSION_TABS: Array<{ key: Version; label: string }> = [
    { key: "mesa", label: "Mesa" },
    { key: "mostrador", label: "Mostrador" },
    { key: "sticker", label: "Sticker" },
  ];

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
    <div className="mx-auto max-w-5xl space-y-6">
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
            <div className="flex gap-2">
              {VERSION_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setVersion(tab.key)}
                  className={`flex-1 rounded-[8px] px-3 py-2 text-sm font-semibold transition-colors ${
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

          {/* Benefit text */}
          <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-4">
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              ¿Qué le ofrecés al cliente por escanear?
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
                {benefitText.length} / {MAX_BENEFIT_LEN} caracteres
              </span>
              <button
                type="button"
                onClick={() => void handleSaveBenefit()}
                disabled={savingBenefit}
                className="flex items-center gap-1 text-xs font-medium text-[#5C6BC0] hover:underline disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                {savedBenefit ? "¡Guardado!" : "Guardar como predeterminado"}
              </button>
            </div>
          </div>

          {/* Color picker */}
          <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-4">
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Color del diseño
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-10 cursor-pointer rounded-[8px] border border-[#E8EAF0] p-0.5"
              />
              <span className="font-mono text-sm font-semibold text-[#1A202C]">{color.toUpperCase()}</span>
              <button
                type="button"
                onClick={() => setColor(business.primaryColor ?? DEFAULT_COLOR)}
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
              {logoFile || logoPreviewUrl ? (
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
              disabled={!qrDataUrl || downloading}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[10px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {downloading ? "Generando PDF…" : "Descargar PDF"}
            </button>
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={!qrDataUrl}
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
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Preview — {version === "mesa" ? "Mesa (10×10 cm)" : version === "mostrador" ? "Mostrador (10×15 cm)" : "Sticker (6×6 cm)"}
            </span>
          </div>

          <div className="flex items-center justify-center rounded-[16px] bg-[#F0F2FA] p-8">
            {version === "mesa" ? (
              <MesaPreview
                business={displayBusiness}
                color={color}
                benefitText={benefitText}
                qrDataUrl={qrDataUrl}
              />
            ) : version === "mostrador" ? (
              <MostradorPreview
                business={displayBusiness}
                color={color}
                benefitText={benefitText}
                qrDataUrl={qrDataUrl}
              />
            ) : (
              <StickerPreview
                business={displayBusiness}
                color={color}
                qrDataUrl={qrDataUrl}
              />
            )}
          </div>

          <p className="max-w-[300px] text-center text-xs text-[#B0B8C9]">
            La preview es representativa. El PDF descargado estará optimizado para impresión a 300 DPI.
          </p>
        </div>
      </div>
    </div>
  );
}
