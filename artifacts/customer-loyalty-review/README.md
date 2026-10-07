# Revisión de la experiencia de tarjeta

Se renderizaron los componentes reales con datos de prueba explícitos (no se crearon negocios ni se modificó la base de datos). Las fixtures y su logo solo viven en `render.cjs`: la UI del producto lee las propiedades reales del negocio y del reward goal.

## Comparación visual

- `before-customer-375.png`: check-in antes del cambio.
- `after-customer-375.png`: header de marca, estado independiente, cuerpo blanco y premio protagonista.
- `before-panel-1440.png` y `after-panel-1440.png`: comparación de la preview y controles.
- `after-counted-*`: visita recién contada.
- `after-unlocked-*`: canje real conservado y sin un nuevo goal ficticio.
- `after-off-*`: sin sellos/beneficio/logo, con navegación disponible.
- `after-long-*`: textos extensos, 12 sellos, tema oscuro e icono personalizado.

Se revisaron 320, 375, 390 y 430 px. No hubo overflow horizontal en las 20 combinaciones customer-facing. El panel se revisó también a 1024 y 1440 px. `node artifacts/customer-loyalty-review/render.cjs after` regenera los HTML/capturas estáticos del diseño actual. Los `before-*.html` conservan el markup y CSS de la versión anterior; no regenerar `before` con el código nuevo.

## React en navegador

Se levantó Next local con una ruta de prueba temporal, que fue eliminada al terminar. Playwright verificó:

- Cambiar de cuenta hace el POST existente y ejecuta el callback (respuesta de logout simulada, no se cerró una sesión real).
- Mis lugares y premios navega a `/mi-flikker`.
- Cambiar color del header, color de sello e icono actualiza la preview inmediatamente.
- Guardar entrega los campos persistidos existentes en el payload (callback de guardado simulado, no se modificó un negocio real).
- Subir un icono SVG personalizado mantiene el mismo origen en completados y pendientes outline.
- La preview móvil se abre con su control existente.

`browser-result.json` conserva los resultados. `browser-check.cjs` registra la verificación usada; requiere la ruta temporal de fixture, que intencionalmente no forma parte del producto final. Las capturas publicadas arriba usan los componentes reales con fixtures, sin la barra de depuración de la ruta temporal.

## Verificación automatizada

Se agregaron pruebas de branding/configuración, estados, progreso y preview compartida. Se actualizaron las expectativas anteriores que pedían números en sellos vacíos y la tarjeta independiente.

La suite completa de web pasó 585 de 586 tests. El único fallo restante es `components/ui/toast.test.tsx`, caso de Reviews/URL Google: el guard de texto no encuentra el bloque esperado en archivos sin cambios de esta tarea. No se modificaron Reviews ni notificaciones para resolver ese test ajeno al rediseño.

Typecheck y lint de todos los archivos modificados se verificaron por separado. No se hizo deploy, commit ni push. No se cambiaron reglas de reward goals, visitas, sesiones, auth ni backend.
