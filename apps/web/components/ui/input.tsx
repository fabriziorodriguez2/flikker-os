import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const CONTROL_CLASS =
  "w-full rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] text-sm text-[color:var(--panel-text)] outline-none transition-colors placeholder:text-[color:var(--panel-text-disabled)] hover:border-[color:var(--panel-border-strong)] focus:border-[color:var(--panel-accent)] focus:ring-[3px] focus:ring-[color:var(--panel-focus-ring)] disabled:cursor-not-allowed disabled:bg-[color:var(--panel-surface-muted)] disabled:text-[color:var(--panel-text-disabled)]";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={`h-10 px-3 ${CONTROL_CLASS} ${className}`}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...props }, ref) {
  return (
    <textarea
      {...props}
      ref={ref}
      className={`min-h-24 resize-y px-3 py-2.5 ${CONTROL_CLASS} ${className}`}
    />
  );
});
