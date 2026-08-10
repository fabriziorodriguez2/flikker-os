"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, ShieldAlert, Ticket, XCircle } from "lucide-react";

interface PreviewData {
  benefitTitle: string;
  customerName: string;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? fallback;
}

/**
 * Pantalla de destino del QR de canje. El código nunca se muestra ni se
 * pide acá — llega en la propia URL (`/redeem/{code}`), invisible para el
 * empleado. Reutiliza exactamente los mismos endpoints que el canje
 * manual (`/redemptions/preview` y `/redemptions/redeem`) — nada nuevo del
 * lado del servidor.
 */
export default function RedeemClient({ code }: { code: string }) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/proxy/redemptions/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          if (!cancelled) {
            setError(await readErrorMessage(res, "No pudimos leer este código."));
          }
          return;
        }
        const data = (await res.json()) as PreviewData;
        if (!cancelled) setPreview(data);
      } catch {
        if (!cancelled) setError("Error de conexión.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function confirm() {
    setConfirmBusy(true);
    try {
      const res = await fetch("/api/proxy/redemptions/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        customerName?: string;
        benefitTitle?: string;
      };
      if (res.ok) {
        setResult({
          ok: true,
          message: `${data.benefitTitle ?? preview?.benefitTitle ?? "Beneficio"} canjeado para ${
            data.customerName ?? preview?.customerName ?? "el cliente"
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

  return (
    <div className="flex min-h-full items-center justify-center bg-[#F5F6FA] p-4">
      <div className="w-full max-w-sm rounded-[16px] border border-[#E8EAF0] bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
          <Ticket className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-base font-bold text-[#1A202C]">
          Canjear recompensa
        </h1>

        {loading ? (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-[#8891A4]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando…
          </div>
        ) : result ? (
          <div
            className={`mt-6 flex flex-col items-center gap-2 ${
              result.ok ? "text-[#12805c]" : "text-[#C0392B]"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="h-8 w-8" />
            ) : (
              <XCircle className="h-8 w-8" />
            )}
            <p className="text-sm font-semibold">{result.message}</p>
          </div>
        ) : error ? (
          <div className="mt-6 flex flex-col items-center gap-2 text-[#C0392B]">
            <ShieldAlert className="h-8 w-8" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : preview ? (
          <div className="mt-6">
            <p className="text-lg font-bold text-[#1A202C]">
              {preview.benefitTitle}
            </p>
            <p className="mt-1 text-sm text-[#8891A4]">
              Cliente: {preview.customerName}
            </p>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={confirmBusy}
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              {confirmBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirmar canje
            </button>
          </div>
        ) : null}

        <Link
          href="/dashboard/benefits"
          className="mt-6 inline-block text-xs font-semibold text-[#8891A4] hover:text-[#1A202C]"
        >
          Ir a Beneficios
        </Link>
      </div>
    </div>
  );
}
