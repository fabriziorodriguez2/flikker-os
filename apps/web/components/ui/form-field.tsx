import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export default function FormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  children,
  className = "",
}: FormFieldProps) {
  return (
    <div className={`grid gap-1.5 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-[color:var(--panel-text-secondary)]"
      >
        {label}
        {required ? (
          <span
            className="ml-1 text-[color:var(--panel-danger-text)]"
            aria-hidden="true"
          >
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p
          className="text-xs text-[color:var(--panel-danger-text)]"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-[color:var(--panel-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
