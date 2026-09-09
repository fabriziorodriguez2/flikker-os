"use client";

import { useEffect, useRef, useState } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";
import RedemptionReveal from "./redemption-reveal";

/**
 * El sello deslizable que revela el código de un beneficio.
 *
 * Vivía dentro de `checkin-client`; se movió acá sin ningún cambio de
 * comportamiento para que `BenefitCard` pueda ofrecerlo como una variante más
 * de revelado (`reveal="slide"`) en vez de que cada superficie reimplemente
 * el suyo. Las animaciones (`checkin-seal-*`) siguen viviendo en
 * `globals.css`, que es global.
 *
 * Al revelar delega en `RedemptionReveal` — el mismo bloque de QR + código
 * que ya usaban el check-in y Mi Flikker.
 */
export default function SlideToReveal({
  code,
  brand,
  onReveal,
}: {
  code: string;
  brand: string;
  onReveal: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(0);
  const pointerStartRef = useRef<{ pointerX: number; dragX: number } | null>(
    null,
  );
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  function maxDrag() {
    return Math.max(0, (trackRef.current?.clientWidth ?? 0) - 60);
  }

  function moveTo(next: number) {
    const value = Math.min(maxDrag(), Math.max(0, next));
    dragRef.current = value;
    setDragX(value);
  }

  function reveal() {
    if (revealed || breaking) return;
    moveTo(maxDrag());
    setBreaking(true);
    onReveal();
    revealTimerRef.current = setTimeout(() => {
      setRevealed(true);
      setBreaking(false);
    }, 620);
  }

  function finishDrag() {
    const max = maxDrag();
    pointerStartRef.current = null;
    setDragging(false);
    if (max > 0 && dragRef.current >= max * 0.76) {
      reveal();
    } else {
      moveTo(0);
    }
  }

  if (revealed) {
    return (
      <div className="text-[color:var(--pub-text)]">
        <RedemptionReveal code={code} redeemPath={`/redeem/${code}`} />
      </div>
    );
  }

  if (breaking) {
    return (
      <div className="checkin-seal-break relative h-[60px] overflow-visible rounded-full">
        <div className="checkin-seal-piece checkin-seal-piece-left absolute inset-y-0 left-0 w-[52%] rounded-l-full border border-[color:var(--pub-surface-border)] bg-black/12 backdrop-blur-sm" />
        <div className="checkin-seal-piece checkin-seal-piece-right absolute inset-y-0 right-0 w-[52%] rounded-r-full border border-[color:var(--pub-surface-border)] bg-black/12 backdrop-blur-sm" />
        <div className="checkin-seal-burst absolute inset-0 z-10 flex items-center justify-center gap-2 text-[color:var(--pub-text)]">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-bold">¡Listo!</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      className="relative h-[60px] touch-none select-none overflow-hidden rounded-full border border-[color:var(--pub-surface-border)] bg-black/12 p-1 shadow-inner"
    >
      <div
        aria-hidden="true"
        className="absolute bottom-1 left-1 top-1 rounded-full bg-[color:var(--pub-surface)] transition-[width] duration-75"
        style={{ width: Math.max(52, dragX + 52) }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center pl-10 pr-3">
        <span
          className={`text-xs font-bold text-[color:var(--pub-text)] transition-opacity duration-200 ${
            dragX > 52 ? "opacity-40" : "opacity-90"
          }`}
        >
          Deslizá para reclamar
        </span>
      </div>
      <button
        type="button"
        aria-label="Deslizá hacia la derecha para revelar el código del beneficio"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pointerStartRef.current = {
            pointerX: event.clientX,
            dragX: dragRef.current,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const start = pointerStartRef.current;
          if (!start) return;
          moveTo(start.dragX + event.clientX - start.pointerX);
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            reveal();
          }
        }}
        className={`absolute left-1 top-1/2 z-10 flex h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] border-white bg-white shadow-[0_6px_18px_rgba(31,35,58,0.22)] outline outline-1 outline-white/35 outline-offset-2 focus-visible:ring-2 focus-visible:ring-white/80 ${
          dragging ? "" : "transition-transform duration-300 ease-out"
        }`}
        style={{
          transform: `translate3d(${dragX}px, -50%, 0)`,
          color: brand,
        }}
      >
        <LockKeyhole className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
