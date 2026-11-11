"use client";

import { useEffect } from "react";
import Button from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={busy ? undefined : onCancel}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--panel-text)]/30 p-0 sm:items-center sm:p-4"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="intelligence-confirm-title"
        aria-describedby="intelligence-confirm-description"
        onClick={(event) => event.stopPropagation()}
        className="w-full rounded-t-[var(--panel-radius-card)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] p-5 sm:max-w-sm sm:rounded-[var(--panel-radius-card)]"
      >
        <h2
          id="intelligence-confirm-title"
          className="text-base font-semibold text-[color:var(--panel-text)]"
        >
          {title}
        </h2>
        <p
          id="intelligence-confirm-description"
          className="mt-1.5 text-sm leading-6 text-[color:var(--panel-text-muted)]"
        >
          {description}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {/* Foco inicial en Cancelar: Enter nunca dispara la acción destructiva. */}
          <Button autoFocus onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
