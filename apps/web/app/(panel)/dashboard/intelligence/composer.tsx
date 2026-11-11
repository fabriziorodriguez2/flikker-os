"use client";

import { useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { canSubmit, composerKeyAction } from "./composer-keys";

const MAX_COMPOSER_LENGTH = 8_000;
const MAX_VISIBLE_ROWS_PX = 200;

interface ComposerProps {
  /** Si hay motivo, el composer se muestra pero no envía, y lo explica. */
  disabledReason: string | null;
  generating: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

export default function Composer({
  disabledReason,
  generating,
  onSubmit,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const disabled = disabledReason !== null;
  const ready = canSubmit(text, { disabled, generating });

  function resize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_VISIBLE_ROWS_PX)}px`;
  }

  function submit() {
    if (!ready) return;
    onSubmit(text.trim());
    setText("");
    requestAnimationFrame(resize);
  }

  return (
    <div className="border-t border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] p-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] p-2 focus-within:border-[color:var(--panel-accent)] focus-within:ring-[3px] focus-within:ring-[color:var(--panel-focus-ring)]"
      >
        <label htmlFor="intelligence-composer" className="sr-only">
          Mensaje para Intelligence
        </label>
        <textarea
          id="intelligence-composer"
          ref={ref}
          rows={1}
          value={text}
          maxLength={MAX_COMPOSER_LENGTH}
          disabled={disabled}
          aria-describedby={disabled ? "intelligence-composer-hint" : undefined}
          placeholder={
            disabled ? "Todavía no disponible" : "Preguntale algo a Intelligence…"
          }
          onChange={(event) => {
            setText(event.target.value);
            resize();
          }}
          onKeyDown={(event) => {
            const action = composerKeyAction({
              key: event.key,
              shiftKey: event.shiftKey,
              isComposing: event.nativeEvent.isComposing,
            });
            if (action === "submit") {
              event.preventDefault();
              submit();
            }
          }}
          className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-[color:var(--panel-text)] outline-none placeholder:text-[color:var(--panel-text-disabled)] disabled:cursor-not-allowed"
        />
        {generating ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Detener respuesta"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] text-[color:var(--panel-text)] hover:bg-[color:var(--panel-surface-muted)]"
          >
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!ready}
            aria-label="Enviar mensaje"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--panel-radius-control)] bg-[color:var(--panel-accent)] text-white hover:bg-[color:var(--panel-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </form>
      <p
        id="intelligence-composer-hint"
        className="mt-2 px-1 text-xs text-[color:var(--panel-text-muted)]"
      >
        {disabledReason ?? "Enter para enviar · Shift + Enter para una línea nueva"}
      </p>
    </div>
  );
}
