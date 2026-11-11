export type ComposerKeyAction = "submit" | "newline" | "none";

export interface ComposerKeyEvent {
  key: string;
  shiftKey: boolean;
  /** true mientras un IME (acentos, japonés, etc.) está componiendo. */
  isComposing: boolean;
}

/**
 * Enter envía, Shift+Enter agrega un salto de línea. Nunca envía a mitad de
 * una composición de IME: ese Enter confirma el carácter, no el mensaje.
 */
export function composerKeyAction(event: ComposerKeyEvent): ComposerKeyAction {
  if (event.key !== "Enter" || event.isComposing) return "none";
  return event.shiftKey ? "newline" : "submit";
}

export function canSubmit(text: string, options: { disabled: boolean; generating: boolean }) {
  return !options.disabled && !options.generating && text.trim().length > 0;
}
