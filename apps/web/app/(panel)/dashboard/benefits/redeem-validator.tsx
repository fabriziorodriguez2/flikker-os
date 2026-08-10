"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  Camera,
  CheckCircle2,
  Keyboard,
  Loader2,
  Ticket,
  X,
  XCircle,
} from "lucide-react";

interface RedeemResult {
  ok: boolean;
  message: string;
}

interface PreviewData {
  code: string;
  benefitTitle: string;
  customerName: string;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? fallback;
}

/**
 * Piloto V2 (#5) — el flujo principal pasa a ser "Escanear recompensa"
 * (cámara → jsQR decodifica el mismo `redemptionCode` de siempre → preview
 * sin consumir → "Confirmar canje" recién ahí llama a /redeem). El código
 * manual queda como fallback explícito, sin tocar su comportamiento.
 *
 * Reutiliza RedemptionService/BenefitParticipation tal cual — no hay ningún
 * endpoint ni tabla nueva más allá de /redemptions/preview (lectura, nunca
 * consume; ver benefits.repository.ts#previewRedemption).
 */
export default function RedeemValidator() {
  const [mode, setMode] = useState<"idle" | "scanning" | "manual">("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [code, setCode] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanningRef = useRef(false);

  function stopCamera() {
    scanningRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => stopCamera, []);

  function tick() {
    if (!scanningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height);
        if (decoded?.data) {
          stopCamera();
          setMode("idle");
          void loadPreview(decoded.data);
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  async function startScanning() {
    setScanError(null);
    setPreview(null);
    setPreviewError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setMode("scanning");
      // El <video> se monta en este render; el stream se conecta en el
      // próximo effect-tick vía el atributo `ref` callback más abajo.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
        scanningRef.current = true;
        rafRef.current = requestAnimationFrame(tick);
      });
    } catch {
      setScanError(
        "No pudimos acceder a la cámara. Podés seguir con el código manual.",
      );
    }
  }

  function cancelScanning() {
    stopCamera();
    setMode("idle");
  }

  async function loadPreview(rawCode: string) {
    const value = rawCode.trim().toUpperCase().slice(0, 16);
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/proxy/redemptions/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      if (!res.ok) {
        setPreviewError(await readErrorMessage(res, "No pudimos leer este código."));
        return;
      }
      const data = (await res.json()) as {
        benefitTitle: string;
        customerName: string;
      };
      setPreview({ code: value, ...data });
    } catch {
      setPreviewError("Error de conexión.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function confirmRedeem() {
    if (!preview) return;
    setConfirmBusy(true);
    try {
      const res = await fetch("/api/proxy/redemptions/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: preview.code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        customerName?: string;
        benefitTitle?: string;
      };
      if (res.ok) {
        setResult({
          ok: true,
          message: `✓ ${data.benefitTitle ?? preview.benefitTitle} canjeado para ${
            data.customerName ?? preview.customerName
          }`,
        });
        setPreview(null);
      } else {
        setResult({ ok: false, message: data.message ?? "No se pudo canjear." });
      }
    } catch {
      setResult({ ok: false, message: "Error de conexión." });
    } finally {
      setConfirmBusy(false);
    }
  }

  async function validateManual() {
    const value = code.trim();
    if (!value) return;
    setManualBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/proxy/redemptions/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        customerName?: string;
        benefitTitle?: string;
      };
      if (res.ok) {
        setResult({
          ok: true,
          message: `✓ ${data.benefitTitle ?? "Beneficio"} canjeado para ${
            data.customerName ?? "el cliente"
          }`,
        });
        setCode("");
      } else {
        setResult({
          ok: false,
          message: data.message ?? "No se pudo validar el código.",
        });
      }
    } catch {
      setResult({ ok: false, message: "Error de conexión." });
    } finally {
      setManualBusy(false);
    }
  }

  return (
    <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
          <Ticket className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1A202C]">
            Validar beneficio
          </p>
          <p className="text-xs text-[#8891A4]">
            Escaneá el QR que muestra el cliente para canjearlo.
          </p>
        </div>
      </div>

      {mode === "scanning" ? (
        <div className="mt-4 space-y-2">
          <div className="relative overflow-hidden rounded-[10px] bg-black">
            <video
              ref={videoRef}
              className="h-64 w-full object-cover"
              muted
              playsInline
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <button
            type="button"
            onClick={cancelScanning}
            className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#E8EAF0] px-3 text-xs font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </button>
        </div>
      ) : preview ? (
        <div className="mt-4 rounded-[10px] border border-[#E8EAF0] bg-[#FAFBFC] p-4">
          <p className="text-base font-bold text-[#1A202C]">
            {preview.benefitTitle}
          </p>
          <p className="mt-0.5 text-sm text-[#8891A4]">
            Cliente: {preview.customerName}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="h-9 rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#1A202C]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmRedeem()}
              disabled={confirmBusy}
              className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              {confirmBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirmar canje
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void startScanning()}
            disabled={previewBusy}
            className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
          >
            {previewBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            Escanear recompensa
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "manual" ? "idle" : "manual")}
            className="inline-flex h-10 items-center gap-1.5 rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#8891A4] hover:text-[#1A202C]"
          >
            <Keyboard className="h-4 w-4" />
            Ingresar código manualmente
          </button>
        </div>
      )}

      {scanError ? (
        <p className="mt-2 text-xs text-[#C0392B]">{scanError}</p>
      ) : null}
      {previewError ? (
        <p className="mt-2 text-xs text-[#C0392B]">{previewError}</p>
      ) : null}

      {mode === "manual" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F0F2FA] pt-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 16))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void validateManual();
            }}
            placeholder="Código (ej. ABCD1234)"
            className="h-10 flex-1 rounded-[8px] border border-[#E8EAF0] bg-white px-3 font-mono text-sm tracking-widest text-[#1A202C] outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
          />
          <button
            type="button"
            onClick={() => void validateManual()}
            disabled={manualBusy || code.trim().length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
          >
            {manualBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Validar
          </button>
        </div>
      ) : null}

      {result ? (
        <div
          className={`mt-3 flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm ${
            result.ok
              ? "bg-[#f0fdf4] text-[#12805c]"
              : "bg-red-50 text-[#C0392B]"
          }`}
        >
          {result.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {result.message}
        </div>
      ) : null}
    </div>
  );
}
