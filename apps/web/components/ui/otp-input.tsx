"use client";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  tone?: "light" | "dark";
  autoFocus?: boolean;
}

export default function OtpInput({
  value,
  onChange,
  tone = "light",
  autoFocus = false,
}: OtpInputProps) {
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? "");
  const dark = tone === "dark";

  return (
    <div className="group relative grid w-full grid-cols-6 gap-2" onClick={(event) => {
      event.currentTarget.querySelector("input")?.focus();
    }}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
        maxLength={6}
        aria-label="Código de verificación de 6 dígitos"
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      {digits.map((digit, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`flex h-[62px] items-center justify-center rounded-[16px] border text-[26px] font-bold tabular-nums shadow-sm transition-all duration-200 group-focus-within:-translate-y-0.5 group-focus-within:shadow-md ${
            dark
              ? "border-white/20 bg-white/12 text-white group-focus-within:border-white/65"
              : "border-[#D9DCE8] bg-white text-[#202333] group-focus-within:border-[#6978D8]"
          } ${digit ? "scale-[1.02]" : ""}`}
        >
          {digit || <span className={dark ? "text-white/25" : "text-[#C8CCDA]"}>·</span>}
        </span>
      ))}
    </div>
  );
}
