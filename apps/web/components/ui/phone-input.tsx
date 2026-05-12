"use client";

const URUGUAY_COUNTRY_CODE = "598";
const URUGUAY_PHONE_PREFIX = `+${URUGUAY_COUNTRY_CODE}`;
const VALID_MIN_DIGITS = 7;
const VALID_MAX_DIGITS = 9;

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

export default function PhoneInput({
  value,
  onChange,
  label,
  required,
  placeholder = "091 624 988",
  className = "",
}: PhoneInputProps) {
  const national = toNationalDigits(value);
  const touched = national.length > 0;
  const valid = isValidNationalPhone(national);

  function handleChange(nextValue: string) {
    const normalized = normalizeUruguayNationalPhone(nextValue);
    onChange(normalized ? `${URUGUAY_PHONE_PREFIX}${normalized}` : "");
  }

  return (
    <label className={`block text-sm ${className}`}>
      {label ? (
        <span className="mb-2 block font-medium text-[color:var(--text-muted)]">
          {label}
        </span>
      ) : null}
      <div
        className={`flex items-center rounded-[16px] border bg-[color:var(--surface)] transition-colors ${
          touched && !valid
            ? "border-[color:var(--danger-text)]"
            : "border-[color:var(--border)] focus-within:border-[color:var(--brand-accent)]"
        }`}
      >
        <span className="shrink-0 border-r border-[color:var(--border)] px-3 text-sm font-semibold text-[color:var(--text-muted)]">
          {URUGUAY_PHONE_PREFIX}
        </span>
        <input
          value={national}
          onChange={(event) => handleChange(event.target.value)}
          inputMode="numeric"
          autoComplete="tel-national"
          required={required}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-[color:var(--foreground)] outline-none placeholder:text-[color:var(--text-soft)]"
        />
        <span className="flex w-10 shrink-0 justify-center">
          {touched ? (
            valid ? (
              <span
                aria-label="Teléfono válido"
                className="text-sm font-bold text-[color:var(--success-text)]"
              >
                ✓
              </span>
            ) : (
              <span
                aria-label="Teléfono inválido"
                className="text-sm font-bold text-[color:var(--danger-text)]"
              >
                ×
              </span>
            )
          ) : null}
        </span>
      </div>
      {touched && !valid ? (
        <p className="mt-2 text-xs text-[color:var(--danger-text)]">
          Formato inválido — ingresá entre 7 y 9 dígitos
        </p>
      ) : null}
    </label>
  );
}

export function normalizeUruguayNationalPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith(URUGUAY_COUNTRY_CODE)) {
    digits = digits.slice(URUGUAY_COUNTRY_CODE.length);
  }
  if (digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }
  return digits.slice(0, VALID_MAX_DIGITS);
}

export function isValidNationalPhone(value: string) {
  return (
    value.length >= VALID_MIN_DIGITS &&
    value.length <= VALID_MAX_DIGITS &&
    /^\d+$/.test(value)
  );
}

export function toNationalDigits(value: string) {
  return normalizeUruguayNationalPhone(value);
}
