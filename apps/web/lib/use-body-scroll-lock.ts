"use client";

import { useEffect } from "react";

/**
 * Congela el scroll de la página mientras hay un modal/drawer abierto.
 *
 * Bug real que cierra (auditoría de caso real, modal de Cliente): al llegar
 * al tope del contenido del modal, el scroll seguía "pasando" a la página de
 * atrás — el fondo se desplazaba y el layout se deformaba con el modal
 * todavía abierto.
 *
 * Dos piezas, las dos necesarias:
 *
 *  1. `overflow: hidden` en el body — congela la página de atrás. Se usa
 *     esta técnica y NO `position: fixed` a propósito: `overflow: hidden`
 *     conserva la posición de scroll solo, sin guardar/restaurar offsets a
 *     mano (que es justo donde esa otra técnica se rompe y hace saltar la
 *     página al cerrar).
 *
 *  2. Compensar el ancho de la barra de scroll con `padding-right`. Al
 *     ocultar el overflow, la barra desaparece y el contenido se corre unos
 *     píxeles: ese salto lateral es parte de la "deformación" que se veía.
 *     En trackpad/touch (barras overlay) el ancho es 0 y no se agrega nada.
 *
 * El scroller propio del modal necesita además `overscroll-contain` en su
 * clase para que su propio límite no encadene — eso vive en el componente.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      const current = Number.parseFloat(
        window.getComputedStyle(body).paddingRight || "0",
      );
      body.style.paddingRight = `${current + scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [active]);
}
