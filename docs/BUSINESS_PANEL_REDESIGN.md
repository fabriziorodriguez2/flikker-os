# Rediseño del panel de negocio de Flikker

## Dirección

El nuevo panel debe sentirse como una herramienta de trabajo: compacto, predecible y silencioso. La identidad de Flikker aparece en las acciones y en pequeños estados de foco; no compite con la información.

La referencia no es una landing ni un dashboard de métricas decorativas. Es una consola SaaS de uso diario, con la claridad de Stripe y Supabase, la densidad de Linear y el criterio visual de Vercel y Railway.

### Principios visuales

1. **La información manda.** Jerarquía, alineación y espaciado resuelven la composición antes que el color o la sombra.
2. **Una superficie por nivel.** Fondo de aplicación, panel y superficie elevada; no apilar cards dentro de cards salvo que exista una relación funcional real.
3. **Color con función.** El violeta identifica acciones, selección y foco. Verde, ámbar y rojo comunican estados, nunca decoración.
4. **Densidad cómoda.** Controles de 36–40 px y filas de 44–52 px. El panel debe permitir trabajar durante horas sin sentirse ni apretado ni inflado.
5. **Consistencia antes que singularidad.** La misma acción debe verse y comportarse igual en todas las pantallas.
6. **Bordes antes que sombras.** Los límites se expresan con contraste sutil. Las sombras quedan reservadas para popovers, menús, modales y drawers.
7. **Movimiento útil.** Transiciones de 120–180 ms para foco, hover y apertura. Sin elevaciones animadas, rebotes ni efectos ornamentales en el panel.
8. **Estados completos.** Loading, vacío, error, éxito, permisos insuficientes y datos parciales son parte de cada pantalla, no excepciones tardías.

## Diagnóstico del sistema actual

El panel ya tiene una buena base funcional: layout persistente, navegación por rol y versión, `PageHeader`, cards de sección, métricas, badges, toast, progreso de ruta y primitives de formulario. No conviene reemplazar esa lógica.

La inconsistencia es principalmente visual:

- Hay 207 archivos TSX entre el panel y sus componentes compartidos.
- Existen más de 3.300 usos de colores hexadecimales dentro de TSX.
- Hay más de 700 radios arbitrarios y cerca de 100 sombras arbitrarias.
- Conviven `Montserrat` y `Syne`; esta última le da a títulos operativos una voz más cercana a branding que a consola.
- Cards, tabs, botones y estados se reconstruyen localmente en muchas pantallas.
- El sidebar usa una selección sólida con sombra, mientras que el brief pide un estado más silencioso.
- Hay tokens globales, pero gran parte del panel no los consume y repite valores directos.

La migración debe eliminar valores visuales locales sin tocar fetches, permisos, rutas, guardas, redirects ni reglas de negocio.

## Paleta

### Tokens base — modo claro

| Token | Valor | Uso |
|---|---:|---|
| `canvas` | `#F7F7F8` | Fondo general |
| `surface` | `#FFFFFF` | Paneles y controles |
| `surface-subtle` | `#FAFAFB` | Cabeceras, hover de filas, zonas secundarias |
| `surface-muted` | `#F2F3F5` | Controles deshabilitados y selección tenue |
| `border` | `#E5E7EB` | Borde estándar |
| `border-strong` | `#D1D5DB` | Separadores o controles con mayor contraste |
| `text` | `#18181B` | Texto principal |
| `text-secondary` | `#52525B` | Descripciones y valores secundarios |
| `text-muted` | `#71717A` | Metadata, labels y placeholders |
| `text-disabled` | `#A1A1AA` | Estados deshabilitados |
| `accent` | `#5C5BD6` | CTA, selección, links clave y foco |
| `accent-hover` | `#4F4EC4` | Hover de acción primaria |
| `accent-soft` | `#EEEEFF` | Fondo seleccionado o informativo |
| `focus-ring` | `rgba(92,91,214,.22)` | Anillo de foco accesible |

### Estados

| Estado | Texto | Fondo | Borde |
|---|---:|---:|---:|
| Éxito | `#087A55` | `#ECFDF5` | `#A7F3D0` |
| Advertencia | `#9A5B13` | `#FFFBEB` | `#FDE68A` |
| Error | `#B42318` | `#FEF2F2` | `#FECACA` |
| Información | `#4947B8` | `#EEEEFF` | `#D8D7FF` |

Regla: un estado usa como máximo fondo tenue, texto y opcionalmente borde. Nunca un bloque saturado completo salvo el botón primario.

## Tipografía

Usar **Geist Sans** en todo el panel de negocio. Es neutral, compacta y funciona bien en tablas, formularios y métricas. Mantener `Syne` exclusivamente en el wordmark o superficies de marca, y no cambiar las experiencias públicas en esta migración.

Escala recomendada:

| Rol | Tamaño / línea | Peso |
|---|---|---:|
| Título de página | 24 / 32 px | 600 |
| Título de sección | 16 / 24 px | 600 |
| Título de bloque | 14 / 20 px | 600 |
| Body | 14 / 20 px | 400 |
| Body pequeño | 13 / 18 px | 400–500 |
| Label | 12 / 16 px | 500 |
| Metadata | 12 / 16 px | 400 |
| Métrica principal | 28 / 34 px | 600, números tabulares |

Evitar mayúsculas con tracking amplio para labels ordinarios. Reservarlas para encabezados de navegación o tabla, con uso moderado.

## Layout general

### Desktop

- Sidebar fija de 240 px, fondo `canvas`, borde derecho de 1 px y sin sombra.
- Área principal con una topbar de 56 px: contexto del negocio a la izquierda; búsqueda o acciones rápidas y perfil a la derecha.
- Contenido con ancho máximo de 1.360 px y padding horizontal de 32 px.
- Encabezado de página compacto, con título, descripción opcional y una única zona de acciones.
- Separación vertical estándar: 24 px entre secciones y 16 px dentro de cada sección.
- Las páginas de datos pueden usar ancho completo; los formularios de configuración se limitan a 760–880 px.

### Sidebar

- Wordmark compacto arriba.
- Selector de negocio como control plano de 40 px, no como card.
- Grupos definidos por labels de 11 px.
- Ítems de 36 px, radio de 6 px.
- Estado activo con `accent-soft`, texto `accent` y un indicador izquierdo de 2 px; sin bloque violeta sólido ni sombra.
- Soporte y perfil al pie, como acciones neutras. WhatsApp puede conservar su icono, pero no debe convertirse en el segundo CTA dominante de toda la aplicación.

### Responsive

- En tablet, sidebar colapsable y contenido con 24 px de padding.
- En móvil, topbar fija con menú, contexto y acción principal opcional.
- Tabs con scroll horizontal; tablas con columnas prioritarias y menú de detalle, no compresión ilegible.
- Drawers ocupan todo el ancho en móvil y entre 440 y 560 px en desktop.

## Sistema de componentes

Todos los componentes deben aceptar variantes semánticas y consumir tokens. Ninguna pantalla nueva debe introducir hexadecimales, radios o sombras arbitrarias.

### Primitives necesarias

- `Button`: `primary`, `secondary`, `ghost`, `danger`; tamaños `sm` y `md`; loading integrado.
- `IconButton`: tooltip y `aria-label` obligatorios.
- `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`: label, hint y error con la misma anatomía.
- `Badge`: `neutral`, `info`, `success`, `warning`, `danger`.
- `Tabs`: variante underline para navegación principal y variante segmentada solo cuando representa un modo local.
- `Card`: `default`, `muted`, `interactive`; padding `sm`, `md`, `lg`.
- `DataTable`: header, row, bulk actions, sort, pagination, vacío y loading.
- `Dialog` y `Drawer`: header, body, footer, cierre, focus trap y bloqueo de scroll uniformes.
- `EmptyState`, `ErrorState`, `Skeleton` y `InlineNotice`.
- `PageHeader`, `SectionHeader`, `Metric`, `Toolbar` y `FilterBar`.

### Criterios por familia

#### Cards

- Radio de 8 px, borde de 1 px y sin sombra por defecto.
- Padding de 16 o 20 px; 24 px solo en formularios o estados vacíos.
- No usar hover con traslación. Una card interactiva cambia borde y fondo suavemente.
- Evitar nested cards: usar separadores, listas o grupos internos.

#### Botones

- Altura estándar de 36 px; 32 px para acciones compactas.
- Radio de 6 px y peso 500–600.
- Una sola acción primaria visible por contexto.
- Destructivas en rojo únicamente en confirmación o menú; no competir con el CTA principal.

#### Formularios

- Labels arriba, controles de 38–40 px y mensajes inmediatamente debajo.
- Secciones delimitadas por títulos y divisores, no por una card por campo.
- Footer de acciones estable o sticky en formularios largos.
- Guardado explícito para cambios importantes; autosave solo donde ya exista.

#### Tablas

- Header de 36–40 px, filas de 48 px y divisores horizontales.
- Tipografía de 13 px, valores importantes en 14 px.
- Hover `surface-subtle`; selección con `accent-soft`.
- Acciones secundarias en menú de tres puntos.
- Filtros, búsqueda, cantidad de resultados y exportación viven en una toolbar única.

#### Tabs

- Navegación entre secciones: underline de 2 px y fondo transparente.
- Segmentado solo para vistas mutuamente excluyentes de un mismo dato.
- No convertir cada tab en una pastilla con sombra.

#### Modales y drawers

- Modal para confirmaciones y tareas cortas; drawer para edición o detalle con contexto.
- Radio de 10 px, sombra baja y overlay negro al 32%.
- Footer separado por borde y acciones alineadas a la derecha.
- El título describe la tarea: “Editar beneficio”, no “Detalles”.

#### Métricas

- Mostrar etiqueta, valor, período y variación cuando exista.
- Sin iconos decorativos grandes ni fondos por categoría.
- Máximo cuatro métricas primarias por fila.
- Las comparaciones deben indicar base temporal: “vs. 30 días anteriores”.

## Propuesta pantalla por pantalla

### Inicio / Dashboard

- Header con período y una acción principal contextual.
- Primera fila de cuatro métricas esenciales, con el mismo alto.
- Gráfico de actividad como superficie principal, acompañado por una columna estrecha de señales o próximos pasos.
- Actividad reciente como lista compacta; mover acciones rápidas a una toolbar o bloque pequeño.
- Reducir cards especializadas que repiten título, borde y estado. Agrupar rating, progreso y retención bajo “Estado del negocio”.

### Insights

- Resumen ejecutivo arriba, sobrio y sin tratamiento de “hero”.
- Ordenar hallazgos por impacto y urgencia.
- Cada insight contiene señal, evidencia, recomendación y acción; la explicación expandida vive en drawer.
- Usar badges solo para impacto/estado y preservar el texto como elemento principal.

### Programa

- Header con estado global y “Invitar clientes” como CTA.
- Reemplazar las pastillas informativas superiores por una línea de metadata y badges compactos.
- Tabs underline: Resumen, Misiones, Configuración.
- Resumen con estado de tarjeta, recompensa y beneficios en una sola lectura.
- Configuración con subnavegación vertical; preview sticky únicamente en Diseño.

### Clientes

- Tabla como elemento dominante.
- Toolbar con búsqueda, segmento, última visita y exportación.
- Identidad, estado, última actividad y valor en columnas prioritarias.
- Detalle en drawer para no perder filtros ni posición de scroll.
- Actividad y check-ins como tabs dentro del drawer, no como cards dispersas.

### Notificaciones

- Tabs underline: Automatizaciones, Promociones, Historial.
- Automatizaciones como tabla/lista con nombre, disparador, audiencia, última ejecución y estado.
- Editor en drawer con resumen del alcance antes de guardar.
- Historial optimizado para escaneo: canal, destinatarios, resultado y fecha.

### Reseñas

- Cabecera de conexión a Google reducida a un estado integrado en la toolbar.
- Métricas de rating, volumen y respuesta en una fila compacta.
- Filtros y tabla/lista de reseñas en una sola superficie.
- Responder en drawer o inline expandible, conservando contexto.

### QR y NFC

- Separar “Puntos de acceso” de “Material para imprimir”.
- Lista o tabla para códigos existentes y su actividad.
- Estudio de impresión como flujo enfocado con preview a la derecha, no como colección de cards.
- La presencia física y los estados de soporte se expresan con notices compactos.

### Configuración

- Subnavegación vertical estable: Negocio, Marca, Equipo, Integraciones y Preferencias según lo que ya exista.
- Formularios de una columna, 760–880 px, con divisores.
- Barra de guardado visible solo cuando hay cambios pendientes.
- Zonas destructivas al final y visualmente separadas.

### Retention / automatizaciones

- Vista principal operativa: estado del motor, alcance, resultados recientes y límites.
- Ajustes avanzados dentro de una sección colapsable o ruta secundaria.
- Experimentos como tabla con hipótesis, audiencia, estado y resultado.
- Dry-run y herramientas internas mantienen su función, pero se distinguen con un badge “Interno”, no con una estética completamente diferente.

### Promociones

- Tabla/lista con estado, audiencia, beneficio, programación y rendimiento.
- Crear/editar en drawer o página enfocada según longitud existente.
- Preview del mensaje dentro del editor, con fondo neutro y tamaño realista.
- Confirmación explícita antes de envíos de impacto alto, preservando la lógica actual.

### Estados transversales

- Loading: skeleton de la estructura final; `RouteProgressBar` como señal global secundaria.
- Vacío: título, una frase útil y una acción; sin ilustración grande por defecto.
- Error: mensaje claro, reintentar y detalle técnico solo si ayuda a soporte.
- Permisos: controles ocultos o deshabilitados de forma consistente con el backend, con explicación breve.

## Qué reutilizar y qué refactorizar

### Reutilizar con cambios visuales

- `PanelLayout`: conserva autenticación, contexto, roles, onboarding e impersonation.
- `resolveNavSections` y el modelo del sidebar: conserva rutas, visibilidad por rol y versiones.
- `PageHeader`: mantener API general; ajustar tipografía, spacing y variantes.
- `ToastProvider`, `RouteProgressBar`, `BusinessLoadError` y `EmptyState`: conservar comportamiento y llevarlos al nuevo lenguaje.
- `Switch`, `ValidatedInput`, `FlikkerSelect` y `PhoneInput`: mantener validación y accesibilidad; aplicar tokens.
- Componentes de dominio: charts, editores, previews, filtros y tablas conservan sus datos y eventos.

### Refactorizar primero

- `globals.css`: separar tokens del panel de los estilos públicos y eliminar del panel sombras/radios heredados.
- `Sidebar` y navegación móvil: nueva composición plana y topbar común.
- `SectionCard`, `MetricCard`, `KPICard` y `StatusBadge`: consolidar variantes y eliminar duplicación.
- Crear `Button`, `Tabs`, `DataTable`, `Dialog`, `Drawer`, `Toolbar`, `FormField` e `InlineNotice` compartidos.
- `ReviewsTable` y tablas de Clientes/Check-ins/Historial: migrar sobre `DataTable` sin alterar sus adaptadores de datos.
- Modales locales grandes —campaña manual, conexión Google, misiones—: compartir shell, footer, estados y accesibilidad.

### No reutilizar como patrón visual

- Hexadecimales directos en JSX.
- Radios `rounded-[…]` y sombras `shadow-[…]` definidos por pantalla.
- Cards con blur, glow o hover de elevación.
- Tabs recreadas con botones y clases locales.
- Badges de dominio que solo cambian el color pero duplican estructura.

## Guía de consistencia

### Spacing y forma

- Escala: 4, 8, 12, 16, 20, 24, 32 y 40 px.
- Radios: 4 px para badges, 6 px para controles, 8 px para cards, 10 px para overlays.
- Bordes: 1 px siempre; 2 px únicamente en foco o selección específica.
- Sombras: ninguna en contenido; `popover` y `modal` son los únicos niveles elevados.

### Iconografía

- Continuar con Lucide.
- Tamaños de 16 px en controles, 18 px en navegación y 20 px en títulos puntuales.
- Stroke consistente de 1.75–2.
- No usar iconos como decoración si el label ya comunica lo mismo.

### Contenido

- Títulos en sentence case.
- Botones con verbo: “Crear promoción”, “Guardar cambios”, “Conectar Google”.
- Fechas y cifras con formato local consistente.
- Errores describen qué ocurrió y cómo recuperarse.
- Evitar repetir título, subtítulo y descripción con el mismo significado.

### Accesibilidad

- Contraste AA en texto y controles.
- Foco visible con el token `focus-ring`.
- Área interactiva mínima de 36 × 36 px en desktop y 44 × 44 px en touch.
- No comunicar estado solo por color.
- Modales con foco atrapado, retorno de foco y cierre por Escape.
- Tablas con headers semánticos y acciones nombradas.

## Orden de implementación

1. **Fundación:** tokens del panel, Geist Sans, primitives y catálogo de estados.
2. **Shell:** sidebar, topbar, PageHeader, navegación móvil y ancho/spacing global.
3. **Piloto:** Inicio, Clientes y Programa; cubren métricas, gráficos, tablas, tabs, formularios y drawers.
4. **Operación:** Notificaciones, Promociones, Reseñas y QR/NFC.
5. **Configuración:** negocio, marca, equipo e integraciones.
6. **Avanzado:** Retention V2, experimentos y herramientas internas.
7. **Normalización:** eliminar estilos locales restantes y validar estados responsive, loading, vacío y error.

Cada fase debe pasar typecheck, lint, tests existentes y una revisión visual en 1440, 1024, 768 y 390 px. La condición de cierre es que las pantallas del panel no contengan nuevos valores visuales arbitrarios y que los flujos existentes produzcan los mismos requests, permisos y resultados que antes.

