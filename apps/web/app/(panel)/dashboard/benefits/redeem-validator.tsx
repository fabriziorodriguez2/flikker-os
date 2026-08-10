"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Ticket, XCircle } from "lucide-react";

interface RedeemResult {
  ok: boolean;
  message: string;
}

/**
 * Canje por URL — el flujo principal ya no pasa por acá: el cliente toca
 * "Mostrar QR para canjear", el empleado lo escanea con la cámara NATIVA de
 * su teléfono (no una cámara dentro de Flikker) y llega directo a
 * `/redeem/{code}` ya logueado. Esta tarjeta queda como fallback explícito
 * — "Canjear manualmente" — para cuando escanear no es una opción (QR no
 * visible, celular sin cámara disponible, etc.). Mismo endpoint de siempre
 * (`/redemptions/redeem`), sin cambios.
 */
export default function RedeemValidator() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);

  async function validate() {
    const value = code.trim();
    if (!value) return;
    setBusy(true);
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
      setBusy(false);
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
            Canjear manualmente
          </p>
          <p className="text-xs text-[#8891A4]">
            Fallback: el cliente normalmente canjea mostrando un QR que se
            escanea con la cámara del teléfono. Usá esto solo si eso no es
            posible.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 16))}
          onKeyDown={(e) => {
            if (e.key === "Enter") void validate();
          }}
          placeholder="Código (ej. ABCD1234)"
          className="h-10 flex-1 rounded-[8px] border border-[#E8EAF0] bg-white px-3 font-mono text-sm tracking-widest text-[#1A202C] outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
        />
        <button
          type="button"
          onClick={() => void validate()}
          disabled={busy || code.trim().length === 0}
          className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Validar
        </button>
      </div>

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
