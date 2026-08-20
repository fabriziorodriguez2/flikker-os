"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2 } from "lucide-react";

/**
 * El QR + código de canje ya revelado — usado por el check-in
 * (`SlideToReveal`) y por Mi Flikker (`GiftReveal`), para que las dos
 * pantallas muestren exactamente el mismo bloque: QR grande, código debajo,
 * un solo renglón de copy. No fija color de texto — hereda el `color` del
 * contenedor (blanco en check-in, oscuro en Mi Flikker).
 */
export default function RedemptionReveal({
  code,
  redeemPath,
}: {
  code: string;
  /** Ruta relativa, ej. `/redeem/{code}` — se resuelve contra el origin actual. */
  redeemPath: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const redeemUrl = `${window.location.origin}${redeemPath}`;
    void QRCode.toDataURL(redeemUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 220,
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [redeemPath]);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex min-h-[220px] w-[220px] items-center justify-center">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="QR de canje"
            className="h-[220px] w-[220px] rounded-[18px] bg-white p-2"
          />
        ) : (
          <Loader2
            className="h-7 w-7 animate-spin opacity-70"
            aria-label="Generando QR"
          />
        )}
      </div>
      <p className="mt-4 font-mono text-[22px] font-bold tracking-[0.15em]">
        {code}
      </p>
      <p className="mt-2 text-sm opacity-70">
        Mostralo al personal para canjearlo.
      </p>
    </div>
  );
}
