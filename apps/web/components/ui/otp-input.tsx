"use client";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

/**
 * Los 6 dígitos de un código OTP.
 *
 * Sin prop de `tone` a propósito — ver el bug real que tenía.
 *
 * ## El bug (dígitos invisibles en "Recuperá tu perfil")
 *
 * Este componente venía de una época en la que cada negocio podía pintar la
 * pantalla ENTERA con su propio color (`Business.checkinBackgroundColor`,
 * ver `customer-shell.tsx`), así que un fondo oscuro necesitaba dígitos
 * blancos y uno claro, dígitos oscuros — de ahí la prop `tone`. El check-in
 * (`RecoverScreen`, "Recuperá tu perfil") pasaba `tone="dark"` codificado a
 * mano, asumiendo que el fondo detrás siempre podía ser oscuro.
 *
 * Cuando el criterio de identidad cambió — Flikker es el marco, el fondo
 * customer-facing es SIEMPRE el mismo gris clarito (`--pub-bg`), nunca el
 * color del negocio — nadie volvió a este componente. `tone="dark"` quedó
 * pidiendo texto blanco (`text-white`) sobre una card casi blanca
 * (`bg-white/12` encima de `--pub-bg`), invisible en la práctica. No era una
 * herencia de dark mode del sistema ni nada del navegador: era un valor fijo
 * en el código, mandado a un fondo que ya no existe.
 *
 * La corrección de raíz es esta: como el fondo customer-facing ya no varía,
 * el componente tampoco necesita variar — un solo estilo, siempre legible,
 * sin ninguna combinación que pueda volver a quedar blanco sobre blanco.
 */
export default function OtpInput({
  value,
  onChange,
  autoFocus = false,
  disabled = false,
}: OtpInputProps) {
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? "");

  return (
    <div
      className={`group relative grid w-full grid-cols-6 gap-2 ${
        disabled ? "opacity-60" : ""
      }`}
      onClick={(event) => {
        if (disabled) return;
        event.currentTarget.querySelector("input")?.focus();
      }}
    >
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
        maxLength={6}
        aria-label="Código de verificación de 6 dígitos"
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
      />
      {digits.map((digit, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`flex h-[62px] items-center justify-center rounded-[16px] border text-[26px] font-bold tabular-nums shadow-sm transition-all duration-200 ${
            disabled
              ? ""
              : "group-focus-within:-translate-y-0.5 group-focus-within:shadow-md group-focus-within:border-[#6978D8]"
          } border-[#D9DCE8] bg-white text-[#202333] ${digit ? "scale-[1.02]" : ""}`}
        >
          {digit || <span className="text-[#C8CCDA]">·</span>}
        </span>
      ))}
    </div>
  );
}
