"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "warning";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  /** Confirmación de una escritura que el backend YA confirmó. */
  success: (message: string) => void;
  /** Algo no se pudo guardar. Si hay una razón concreta del backend, va acá. */
  error: (message: string) => void;
  warning: (message: string) => void;
}

const NOOP: ToastApi = {
  success: () => {},
  error: () => {},
  warning: () => {},
};

const ToastContext = createContext<ToastApi | null>(null);

/** Cuánto vive un toast antes de irse solo. */
const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  success: 3200,
  warning: 4500,
  error: 5200,
};

/**
 * Ventana de deduplicación. Una sola acción del dueño puede disparar varias
 * mutations internas (guardar diseño + recargar, togglear + refetch): sin
 * esto se apilarían tres "Cambios guardados" idénticos por un solo click.
 */
const DEDUPE_MS = 1200;

/**
 * Sistema ÚNICO de confirmaciones del panel. Nadie arma su propio cartelito
 * de "Guardado ✓" por pantalla: se llama `useToast()` y listo.
 *
 * Reglas que hacen que se pueda confiar en lo que dice:
 *  - `success` se llama DESPUÉS de que la promesa de la escritura resolvió
 *    bien. Nunca en optimista: si el backend falla, el dueño no puede haber
 *    visto "Cambios guardados".
 *  - Los duplicados dentro de `DEDUPE_MS` se descartan (ver arriba).
 *  - `aria-live="polite"` + `role="status"`: un lector de pantalla lo anuncia
 *    sin robar el foco ni interrumpir lo que se esté leyendo.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const lastShown = useRef(new Map<string, number>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const text = message.trim();
      if (!text) return;

      const key = `${kind}:${text}`;
      const now = Date.now();
      const previous = lastShown.current.get(key);
      if (previous !== undefined && now - previous < DEDUPE_MS) return;
      lastShown.current.set(key, now);

      const id = nextId.current++;
      setToasts((current) => [...current, { id, kind, message: text }]);

      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS[kind]),
      );
    },
    [dismiss],
  );

  // Los timers pendientes se cancelan al desmontar — nunca un setState sobre
  // un componente que ya no está.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message: string) => show("success", message),
      error: (message: string) => show("error", message),
      warning: (message: string) => show("warning", message),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Fuera del provider devuelve un no-op en vez de tirar: hay pantallas
 * compartidas con LEGACY que montan estos componentes sin el provider, y una
 * confirmación que no aparece nunca puede romper un guardado que sí funcionó.
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

const STYLES: Record<
  ToastKind,
  { icon: typeof Check; iconClass: string; ring: string }
> = {
  success: {
    icon: Check,
    iconClass: "bg-[#EAF7EF] text-[#147A5B]",
    ring: "border-[#D6EADF]",
  },
  error: {
    icon: X,
    iconClass: "bg-[#FDECEA] text-[#C0392B]",
    ring: "border-[#F3D6D2]",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "bg-[#FFF7EE] text-[#8A520D]",
    ring: "border-[#F0E1CC]",
  },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[120] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => {
        const style = STYLES[toast.kind] ?? STYLES.success;
        const Icon = style.icon ?? Info;
        return (
          <div
            key={toast.id}
            className={`toast-enter pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[14px] border ${style.ring} bg-white px-4 py-3 shadow-[0_12px_32px_rgba(17,22,59,0.16)]`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.iconClass}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 text-sm font-semibold text-[#202333]">
              {toast.message}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Cerrar aviso"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8891A4] hover:bg-[#F3F4F8]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
