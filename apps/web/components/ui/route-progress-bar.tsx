/**
 * Barra de carga global — el único lenguaje visual para "algo principal está
 * cargando" en el panel Check-in V2 (pedido explícito: eliminar los ~15
 * skeletons/spinners distintos que había por pantalla). Una franja violeta
 * fina en la parte superior, con un segmento que se desliza de izquierda a
 * derecha (ver `.route-progress-bar-fill` en `globals.css`).
 *
 * Uso principal — `loading.tsx` de ruta: cada archivo pasa a ser
 * literalmente `export default () => <RouteProgressBar />`. Next ya monta
 * ese `loading.tsx` apenas empieza la navegación y lo desmonta solo cuando
 * la página real terminó de cargar (Suspense nativo) — "aparece
 * inmediatamente" y "desaparece al terminar" quedan gratis, sin estado
 * propio que mantener ni riesgo de que quede colgada.
 *
 * Uso secundario — loaders locales que fetchean su propio dato (un drawer,
 * un modal): renderizar esto en el `if (loading)` de esa pantalla en vez de
 * su spinner/skeleton propio. NO reemplaza loaders chicos dentro de un
 * botón que está guardando — esos siguen aportando contexto puntual, este
 * componente es solo para la carga PRINCIPAL de una pantalla.
 *
 * `position: fixed` a propósito: nunca empuja el resto del layout ni genera
 * saltos, sea cual sea el contenido que está por debajo mientras carga.
 */
export default function RouteProgressBar() {
  return (
    <div
      role="status"
      aria-label="Cargando"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[200] h-[3px] w-full overflow-hidden bg-transparent"
    >
      <div className="route-progress-bar-fill h-full bg-[#5C6BC0]" />
    </div>
  );
}
