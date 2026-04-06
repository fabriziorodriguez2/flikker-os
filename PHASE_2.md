Leé primero estos archivos antes de escribir código:

- ARCHITECTURE.md
- PRODUCT_SCOPE.md
- CLAUDE.md
- PHASE_0.md
- documentación de Fase 1 y Fase 2 relevante del repo
- docs/modules/campaigns.md si existe
- docs/modules/qr_codes.md si existe

Contexto:
La Fase 1 ya está cerrada o suficientemente cerrada.
Ahora quiero arrancar la Fase 2 — Captación.

La definición exacta de Fase 2 para este proyecto es:

- entidad `campaign` y `qr_code`
- redirección dinámica `/r/{slug}` con tracking
- landing intermedia opcional con branding por negocio
- fuentes de tráfico: mostrador, mesa, caja, packaging, bio, web, WhatsApp
- registro de scan, click, dispositivo, horario, campaña y sucursal
- generador y descarga de QR en PNG/SVG/PDF
- vista de rendimiento por QR y campaña

No uses una interpretación genérica.

No escribas código todavía.

Primero devolveme únicamente:

1. qué ya está resuelto desde Fase 1 que impacta Fase 2
2. qué falta exactamente para cerrar Fase 2
3. un plan en pasos chicos, mergeables y en orden correcto
4. qué archivos tocarías en cada paso
5. riesgos de tenancy, redirect público, tracking y abuso
6. qué NO conviene mezclar en el mismo PR

---

Leé primero estos archivos antes de escribir código:

- ARCHITECTURE.md
- PRODUCT_SCOPE.md
- CLAUDE.md
- PHASE_0.md
- documentación de Fase 1 y Fase 2 relevante del repo
- docs/modules/campaigns.md si existe
- docs/modules/qr_codes.md si existe

Contexto:
La Fase 1 ya está cerrada o suficientemente cerrada.
Ahora quiero arrancar la Fase 2 — Captación.

La definición exacta de Fase 2 para este proyecto es:

- entidad `campaign` y `qr_code`
- redirección dinámica `/r/{slug}` con tracking
- landing intermedia opcional con branding por negocio
- fuentes de tráfico: mostrador, mesa, caja, packaging, bio, web, WhatsApp
- registro de scan, click, dispositivo, horario, campaña y sucursal
- generador y descarga de QR en PNG/SVG/PDF
- vista de rendimiento por QR y campaña

No uses una interpretación genérica.

No escribas código todavía.

Primero devolveme únicamente:

1. qué ya está resuelto desde Fase 1 que impacta Fase 2
2. qué falta exactamente para cerrar Fase 2
3. un plan en pasos chicos, mergeables y en orden correcto
4. qué archivos tocarías en cada paso
5. riesgos de tenancy, redirect público, tracking y abuso
6. qué NO conviene mezclar en el mismo PR

---

Implementemos solo el modelo de datos y migraciones de Fase 2.

Objetivo:
dejar correctamente modeladas las entidades de captación sin hacer UI todavía.

Debe incluir como mínimo:

- `campaign`
- `qr_code`
- `redirect_target` si lo considerás necesario
- `qr_event` o equivalente para tracking
- campos para source/utm/branch/business/status
- relaciones, índices y constraints necesarios

Fuentes de tráfico esperadas:

- mostrador
- mesa
- caja
- packaging
- bio
- web
- WhatsApp

Reglas:

- no implementar todavía reviews ni responses
- no mezclar frontend grande
- no mezclar assets complejos
- mantener tenant isolation estricto
- pensar en trazabilidad comercial desde el esquema

Primero:

1. devolveme plan corto
2. listá entidades, relaciones, índices y constraints
3. explicá decisiones de modelado importantes
4. recién después implementá schema y migraciones

Al final:

- resumí el modelo final
- listá migraciones creadas
- decime qué quedó listo para la siguiente tanda
- corré tests relacionados

---

Implementemos solo el backend del módulo de campaigns para Fase 2.

Objetivo:
CRUD seguro y usable de campañas por negocio/sucursal.

Debe incluir:

- crear campaña
- listar campañas del negocio
- ver detalle de campaña
- editar campaña
- activar/pausar/archivar si aplica
- relación con branch y business
- tipo/fuente/canal según el modelo elegido

Reglas:

- no hacer redirect público todavía
- no mezclar QR rendering todavía
- no hacer UI todavía
- no tocar reviews ni analytics avanzados
- mantener consistencia con el patrón backend actual

Primero:

1. devolveme plan breve
2. listá endpoints/DTOs/tests a crear
3. explicá reglas de permisos y tenancy
4. recién después implementá

Al final:

- resumí qué cambió
- mostrame contratos API
- decime cómo probar permisos y tenancy
- corré lint, typecheck y tests afectados

---

Implementemos solo el backend del módulo de QR codes para Fase 2.

Objetivo:
permitir crear y gestionar QR codes trazables por campaña y sucursal.

Debe incluir:

- crear QR code
- listar QR codes por campaña
- ver detalle de QR code
- editar metadata útil
- activar/desactivar si aplica
- slug único o mecanismo equivalente para redirect
- asociación a campaign/business/branch

Reglas:

- no implementar todavía la descarga PNG/SVG/PDF
- no hacer frontend grande
- no tocar reviews
- validar unicidad y tenancy correctamente

Primero:

1. devolveme plan breve
2. listá DTOs/endpoints/tests
3. explicá cómo garantizás slugs únicos y trazabilidad
4. recién después implementá

Al final:

- resumí cambios
- explicame cómo probar unicidad, permisos y acceso
- corré tests afectados

---

Implementemos solo el redirect público de Fase 2.

Objetivo:
resolver `/r/{slug}` con tracking comercial básico y redirección correcta.

Debe incluir:

- endpoint o ruta pública `/r/{slug}`
- resolución del destino según QR/campaign
- registro de evento antes de redirigir
- tracking mínimo de:
  - timestamp
  - qr_code
  - campaign
  - business
  - branch si corresponde
  - source/canal si está modelado
  - dispositivo/user-agent
- redirección rápida y robusta

Reglas:

- no hacer landing intermedia todavía
- no meter analytics avanzados
- no meter reviews
- proteger razonablemente contra abuso o inconsistencias
- priorizar simplicidad, velocidad y trazabilidad

Primero:

1. devolveme plan breve
2. listá rutas/servicios/tests
3. explicá edge cases y riesgos de endpoints públicos
4. recién después implementá

Al final:

- resumí cambios
- explicame cómo probar redirects y tracking
- decime qué logs/observabilidad agregaste
- corré tests afectados

---

Implementemos solo la landing intermedia opcional para Fase 2.

Objetivo:
tener una página intermedia brandizada por negocio antes del destino final, cuando la campaña/QR así lo requiera.

Debe incluir:

- toggle/configuración para usar o no landing intermedia
- branding básico del negocio
- CTA principal
- destino final de redirección
- soporte simple para campaign + qr_code + branch

Reglas:

- UI mínima y funcional
- no sobreconstruir marketing pages
- no hacer experimentación A/B todavía
- no mezclar reviews ni widgets
- mantener tiempos de carga razonables

Primero:

1. devolveme estructura propuesta
2. listá rutas/componentes/endpoints necesarios
3. explicá cómo se define cuándo usar landing y cuándo redirect directo
4. recién después implementá

Al final:

- resumí cambios
- explicame cómo probar ambos flujos
- corré typecheck/tests afectados

---

Implementemos solo la generación y descarga de QR para Fase 2.

Objetivo:
permitir generar y descargar QR codes en formatos útiles para uso comercial.

Debe incluir:

- generación correcta del QR
- descarga en PNG
- descarga en SVG
- descarga en PDF
- branding mínimo si corresponde, sin sobrecomplicar diseño
- consistencia entre la URL embebida y el slug del sistema

Reglas:

- no mezclar panel analítico todavía
- no hacer editor visual complejo
- no tocar reviews ni widgets
- priorizar salida usable para impresión y envío

Primero:

1. devolveme plan breve
2. listá librerías/archivos/componentes o servicios a tocar
3. explicá el enfoque para PNG/SVG/PDF
4. recién después implementá

Al final:

- resumí cambios
- explicame cómo validar cada formato
- listá limitaciones actuales
- corré tests afectados

---

Implementemos solo la vista de rendimiento básica de Fase 2.

Objetivo:
mostrar métricas operativas mínimas por QR y campaña.

Debe incluir como mínimo:

- cantidad de scans/clicks/eventos
- corte por campaña
- corte por QR
- referencia a branch si existe
- rango temporal básico si es razonable
- vista simple y útil, no dashboard bonito

Reglas:

- no hacer analytics avanzados todavía
- no mezclar cohortes ni benchmarks
- no tocar reviews
- priorizar lectura operativa simple

Primero:

1. devolveme estructura propuesta
2. listá endpoints/queries/componentes necesarios
3. explicá qué métricas exactas mostrarías en Fase 2 y cuáles dejarías para Fase 7
4. recién después implementá

Al final:

- resumí cambios
- explicame cómo probar consistencia de métricas
- corré tests/typecheck afectados

---

Quiero cerrar Fase 2 con observabilidad y protección mínima del módulo de captación.

Objetivo:
endurecer lo público sin entrar todavía en robustez total de Fase 10.

Implementá únicamente lo necesario para:

- logs útiles en redirects públicos
- correlation o request context si aplica
- manejo razonable de errores en `/r/{slug}`
- protección mínima o rate limiting si ya está disponible en la arquitectura
- validación/sanitización de inputs visibles

Reglas:

- no rehacer observabilidad de todo el sistema
- no agregar features de negocio
- no mezclar analytics avanzados
- cambio mínimo pero serio

Primero:

1. devolveme plan breve
2. listá archivos a tocar
3. explicá enfoque elegido
4. recién después implementá

Al final:

- resumí cambios
- explicame cómo probar casos inválidos y abuso básico
- decime qué quedaría para Fase 10

---

Implementemos solo seeds demo realistas para Fase 2.

Objetivo:
dejar escenarios de captación listos para demo y prueba local.

Debe incluir:

- varias campaigns demo
- varios qr_codes demo
- distintas fuentes de tráfico
- campañas ligadas a branches reales
- algunos ejemplos con landing intermedia y otros con redirect directo
- eventos demo mínimos si tiene sentido

Reglas:

- seeds idempotentes
- datos verosímiles
- nombres claros
- no meter basura innecesaria

Primero:

1. devolveme plan breve
2. listá qué escenarios demo vas a crear
3. explicá qué parte de Fase 2 cubre cada escenario
4. recién después implementá

Al final:

- explicame cómo correr seeds
- listá escenarios demo disponibles
- decime qué flujos quedan listos para mostrar

---

Actuá como staff engineer auditando el proyecto contra la definición oficial de Fase 2.

No escribas código.
No modifiques archivos.

La Fase 2 en este proyecto significa:

- entidad `campaign` y `qr_code`
- redirección dinámica `/r/{slug}` con tracking
- landing intermedia opcional con branding por negocio
- fuentes de tráfico
- registro de scan, click, dispositivo, horario, campaña y sucursal
- generador y descarga de QR en PNG/SVG/PDF
- vista de rendimiento por QR y campaña

Quiero que revises:

- schema y migraciones
- tenancy
- permisos
- redirect público
- tracking
- generación de QR
- panel de rendimiento básico
- seeds demo
- riesgos antes de entrar a Fase 3

Devolveme únicamente:

1. qué puntos de Fase 2 están efectivamente cumplidos
2. qué puntos siguen flojos o incompletos
3. riesgos reales antes de entrar a Fase 3
4. qué arreglarías sí o sí antes de reviews
5. si Fase 2 ya puede considerarse cerrada o no, con justificación concreta

---
