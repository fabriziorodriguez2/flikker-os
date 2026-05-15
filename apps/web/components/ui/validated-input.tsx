"use client";

import { useState, type InputHTMLAttributes } from "react";

interface ValidationResult {
  valid: boolean;
  message?: string;
}

interface ValidatedInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  validate?: (value: string) => ValidationResult;
  showValidation?: boolean;
  errorMessage?: string;
}

export default function ValidatedInput({
  value,
  onChange,
  validate,
  showValidation = Boolean(validate),
  errorMessage = "Formato inválido",
  className = "",
  onBlur,
  ...props
}: ValidatedInputProps) {
  const [touched, setTouched] = useState(false);
  const result = validate?.(value)  { valid: true };
  const shouldShow = showValidation && touched && value.trim().length > 0;
  const invalidMessage = result.message  errorMessage;

  return (
    <div className="grid gap-2">
      <div className="relative">
        <input
          {...props}
          value={value}
          onChange={(event) => {
            setTouched(true);
            onChange(event.target.value);
          }}
          onBlur={(event) => {
            setTouched(true);
            onBlur?.(event);
          }}
          className={`${className} ${showValidation  "pr-10" : ""}`}
        />
        {shouldShow  (
          <span className="pointer-events-none absolute right-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center">
            {result.valid  (
              <span
                aria-label="Valor válido"
                className="text-sm font-bold leading-none text-[color:var(--success-text)]"
              >
                ✓
              </span>
            ) : (
              <span
                aria-label="Valor inválido"
                className="text-sm font-bold leading-none text-[color:var(--danger-text)]"
              >
                ×
              </span>
            )}
          </span>
        ) : null}
      </div>
      {shouldShow && !result.valid  (
        <p className="text-xs text-[color:var(--danger-text)]">
          {invalidMessage}
        </p>
      ) : null}
    </div>
  );
}
