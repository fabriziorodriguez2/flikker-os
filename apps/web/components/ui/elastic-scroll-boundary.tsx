"use client";

import { ReactNode, useEffect, useRef } from "react";

interface ElasticScrollBoundaryProps {
  children: ReactNode;
}

function hasScrollableAncestor(
  target: EventTarget | null,
  boundary: HTMLElement,
  deltaY: number,
) {
  let element = target instanceof HTMLElement ? target : null;

  while (element && element !== boundary) {
    const { overflowY } = window.getComputedStyle(element);
    const isScrollable =
      (overflowY === "auto" || overflowY === "scroll") &&
      element.scrollHeight > element.clientHeight + 1;

    if (isScrollable) {
      const canContinue =
        deltaY < 0
          ? element.scrollTop > 0
          : element.scrollTop + element.clientHeight < element.scrollHeight - 1;

      if (canContinue) return true;
    }

    element = element.parentElement;
  }

  return false;
}

export default function ElasticScrollBoundary({
  children,
}: ElasticScrollBoundaryProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const lastBounceRef = useRef(0);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    function handleWheel(event: WheelEvent) {
      if (!content || reduceMotion.matches || Math.abs(event.deltaY) < 2) {
        return;
      }

      const main = content.parentElement;
      if (!main || hasScrollableAncestor(event.target, main, event.deltaY)) {
        return;
      }

      const mainScrolls = main.scrollHeight > main.clientHeight + 1;
      const scroller = mainScrolls
        ? main
        : (document.scrollingElement as HTMLElement | null);
      if (!scroller) return;

      const atTop = scroller.scrollTop <= 0;
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      const pushingPastTop = event.deltaY < 0 && atTop;
      const pushingPastBottom = event.deltaY > 0 && atBottom;

      if (!pushingPastTop && !pushingPastBottom) return;

      const now = performance.now();
      if (now - lastBounceRef.current < 240) return;
      lastBounceRef.current = now;

      const distance = pushingPastTop ? 7 : -7;
      content.getAnimations().forEach((animation) => animation.cancel());
      content.animate(
        [
          { transform: "translateY(0)" },
          { transform: `translateY(${distance}px)`, offset: 0.38 },
          { transform: "translateY(0)" },
        ],
        {
          duration: 300,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    }

    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div ref={contentRef} className="min-h-full">
      {children}
    </div>
  );
}
