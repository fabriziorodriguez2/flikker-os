interface PoweredByFlikkerProps {
  className?: string;
}

/**
 * "Powered by" + el wordmark oficial (`/flikker-wordmark.svg`) — la MISMA
 * pieza que usa `BrandWordmark` en el resto del producto, no una relectura
 * en texto plano. Antes acá se escribía "Flikker" como `<span>` con la
 * tipografía de la página; ahora es el logotipo real, así que se ve
 * idéntico al de cualquier otra superficie con marca Flikker.
 *
 * Un solo componente, usado desde `CustomerShell` — así que arreglarlo acá
 * alcanza para las ocho superficies V2 (registro, OTP, personal, feedback,
 * Mi Flikker, detalle de lugar, beneficio, vacíos/errores) de una sola vez.
 *
 * Sin variante de tema: el fondo customer-facing es siempre claro (ver
 * `CustomerShell`), así que el wordmark oscuro fijo (`#3a3a3a`, el mismo
 * archivo que carga `BrandWordmark` en modo claro) siempre tiene contraste.
 */
export default function PoweredByFlikker({ className }: PoweredByFlikkerProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className ?? ""}`}
      aria-label="Powered by Flikker"
    >
      <span aria-hidden="true" className="text-[0.95em]">
        Powered by
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/flikker-wordmark.svg"
        alt=""
        aria-hidden="true"
        className="h-[0.85em] w-auto shrink-0 opacity-80"
      />
    </span>
  );
}
