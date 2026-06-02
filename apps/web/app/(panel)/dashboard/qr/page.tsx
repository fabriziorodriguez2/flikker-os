"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import QRCode from "qrcode";

const QR_BASE_URL = "https://flikker.site/qr";
const QR_SIZE = 800;
const LOGO_MAX_RATIO = 0.28;
const LOGO_PADDING = 10;
const LOGO_RADIUS = 14;

interface BusinessData {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

async function generateQr(
  businessId: string,
  logoUrl: string | null,
  color: string,
): Promise<string> {
  const url = `${QR_BASE_URL}/${businessId}`;

  const canvas = document.createElement("canvas");
  canvas.width = QR_SIZE;
  canvas.height = QR_SIZE;

  await QRCode.toCanvas(canvas, url, {
    errorCorrectionLevel: logoUrl ? "H" : "M",
    margin: 4,
    width: QR_SIZE,
    color: { dark: color, light: "#ffffff" },
  });

  if (logoUrl) {
    const ctx = canvas.getContext("2d")!;
    const img = await loadImage(logoUrl);

    const maxLogoSize = QR_SIZE * LOGO_MAX_RATIO;
    const ratio = Math.min(maxLogoSize / img.width, maxLogoSize / img.height);
    const logoW = img.width * ratio;
    const logoH = img.height * ratio;

    const bgW = logoW + LOGO_PADDING * 2;
    const bgH = logoH + LOGO_PADDING * 2;
    const bgX = (QR_SIZE - bgW) / 2;
    const bgY = (QR_SIZE - bgH) / 2;

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, bgX, bgY, bgW, bgH, LOGO_RADIUS);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, bgX, bgY, bgW, bgH, LOGO_RADIUS);
    ctx.clip();
    ctx.drawImage(img, bgX + LOGO_PADDING, bgY + LOGO_PADDING, logoW, logoH);
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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

function FlowModal({ onClose }: { onClose: () => void }) {
  const steps = [
    {
      num: "1",
      title: "Escanea el QR",
      desc: "El paciente apunta la cámara y llega a tu landing de captación.",
    },
    {
      num: "2",
      title: "Deja su nombre y WhatsApp",
      desc: "Completa un formulario simple de dos campos y queda registrado en tu base.",
    },
    {
      num: "3",
      title: "Ve la confirmación",
      desc: "Recibe un mensaje de bienvenida y ve el beneficio si lo configuraste.",
    },
    {
      num: "4",
      title: "Le pedimos una reseña en Google",
      desc: "Justo después aparece un botón grande para dejar su opinión en tu perfil de Google.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#E8EAF0] bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1A202C]">Flujo completo del paciente</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#8891A4] hover:bg-[#F5F6FA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          {steps.map((step) => (
            <div key={step.num} className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5C6BC0]/10 text-sm font-bold text-[#5C6BC0]">
                {step.num}
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1A202C]">{step.title}</p>
                <p className="mt-0.5 text-xs text-[#8891A4]">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl bg-[#F7F8FA] px-4 py-3 text-xs text-[#8891A4]">
          El botón de reseña en Google aparece 3 segundos después de que el paciente confirma su registro.
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-[#5C6BC0] py-2.5 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

export default function QrPage() {
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFlow, setShowFlow] = useState(false);
  const generatingRef = useRef(false);

  const buildQr = useCallback(async (biz: BusinessData) => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    try {
      const color = biz.primaryColor ?? "#000000";
      const dataUrl = await generateQr(biz.id, biz.logoUrl, color);
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl(null);
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
        const data = (await res.json()) as BusinessData;
        setBusiness(data);
        void buildQr(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [buildQr]);

  function handleDownload() {
    if (!qrDataUrl || !business) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qr-${business.name.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  }

  const qrUrl = business ? `${QR_BASE_URL}/${business.id}` : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1A202C]">Tu QR de captación</h1>
        <p className="mt-1 text-sm text-[#8891A4]">
          Colocalo en tu sala de espera o mostrador. Cada escaneo captura un contacto nuevo para tu base.
        </p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-[#8891A4]">
          Generando QR…
        </div>
      ) : error ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-[#E8EAF0] bg-white p-4 text-center shadow-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#8891A4]">
              {business?.name}
            </p>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR de captación"
                className="mx-auto w-56 rounded-xl border border-[#F3F4F8]"
              />
            ) : (
              <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-xl bg-[#F5F6FA] text-xs text-[#8891A4]">
                Generando…
              </div>
            )}
            {qrUrl && (
              <p className="mt-3 break-all text-xs text-[#B0B8C9]">{qrUrl}</p>
            )}
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Tu QR está listo. Imprimilo y ponelo donde tus pacientes esperan. Cada escaneo captura un contacto nuevo y después los lleva directo a dejarte una reseña en Google.
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!qrDataUrl}
              className="inline-flex items-center gap-2 rounded-xl bg-[#5C6BC0] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Descargar QR
            </button>
            <button
              type="button"
              onClick={() => setShowFlow(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E8EAF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
            >
              Ver flujo completo
            </button>
          </div>
        </>
      )}

      {showFlow && <FlowModal onClose={() => setShowFlow(false)} />}
    </div>
  );
}
