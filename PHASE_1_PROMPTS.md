Leé primero estos archivos antes de escribir código:

- ARCHITECTURE.md
- PRODUCT_SCOPE.md
- CLAUDE.md
- PHASE_0.md
- docs/modules/businesses.md
- docs/modules/branches.md
- docs/modules/memberships.md

Contexto:
La Fase 0 ya está cerrada o prácticamente cerrada.
Ahora quiero arrancar la Fase 1 — Core de negocio.

La definición exacta de Fase 1 para este proyecto es:

- CRUD de negocio y sucursales
- perfil de marca: logo, colores, tono, firma, links, WhatsApp, sitio
- usuarios por negocio con roles: owner, admin, operator, viewer
- planes y límites lógicos, sin cobro automático todavía
- panel interno global para ver todas las cuentas
- seeds demo realistas

No uses una interpretación genérica.

No escribas código todavía.

Primero devolveme únicamente:

1. qué ya está resuelto desde Fase 0 que impacta Fase 1
2. qué falta exactamente para cerrar Fase 1
3. un plan en pasos chicos, mergeables y en orden correcto
4. qué archivos tocarías en cada paso
5. riesgos de tenancy, permisos, contratos API y UX
6. qué NO conviene mezclar en el mismo PR

---

Implementemos solo el modelo de datos y migraciones de Fase 1.

Objetivo:
dejar bien modeladas las entidades core del negocio sin hacer todavía UI grande.

Debe cubrir:

- businesses
- branches
- brand_profile o equivalente
- memberships/roles por negocio si requieren ajuste
- plans y límites lógicos básicos, sin billing real

Reglas:

- no implementar todavía campañas, reviews, widgets ni analytics
- no mezclar panel grande
- no tocar features de Fase 2+
- mantener tenant isolation estricto
- preferir nombres claros y constraints de DB correctos

Primero:

1. devolveme el plan corto
2. listá entidades, relaciones, índices y constraints
3. señalá decisiones de modelado importantes
4. recién después implementá migraciones y cambios de schema

Al final:

- resumí el modelo final
- listá migraciones creadas
- decime qué quedó listo para la siguiente tanda
- corré tests relacionados

---

Implementemos solo el backend del módulo de negocios para Fase 1.

Objetivo:
CRUD seguro de business, con tenant rules y validaciones correctas.

Debe incluir:

- crear negocio si aplica dentro de la lógica esperada del sistema
- obtener negocio actual
- actualizar datos principales del negocio
- listar negocios solo donde el usuario tenga acceso
- validaciones y permisos adecuados

Reglas:

- no hacer frontend todavía
- no mezclar branches en esta tanda salvo dependencia mínima
- no tocar campaigns, reviews, responses ni widgets
- mantener consistencia con el patrón Service/Repository elegido en el repo

Primero:

1. devolveme plan breve
2. listá endpoints/DTOs/tests a crear
3. explicá reglas de permisos
4. recién después implementá

Al final:

- resumí qué cambió
- mostrame contratos API
- decime cómo probar permisos y tenancy
- corré lint, typecheck y tests afectados

---

Implementemos solo el módulo de sucursales para Fase 1.

Objetivo:
CRUD de branches por negocio, bien aislado por tenant y con permisos claros.

Debe incluir:

- crear sucursal
- listar sucursales del negocio
- ver detalle de sucursal
- editar sucursal
- desactivar o archivar si el modelo lo requiere

Campos esperables:

- nombre
- slug o identificador si aplica
- dirección
- teléfono
- horarios o metadata básica
- estado activo/inactivo si tiene sentido

Reglas:

- no mezclar UI todavía
- no tocar QR, campaigns, reviews ni widget
- no meter analytics
- validar siempre business ownership / access

Primero:

1. devolveme plan breve
2. listá DTOs/endpoints/tests
3. explicá edge cases de tenancy y permisos
4. recién después implementá

Al final:

- resumí cambios
- explicame cómo probar branches por negocio
- corré tests afectados

---

Implementemos solo el perfil de marca del negocio para Fase 1.

Objetivo:
guardar y editar branding básico que luego usarán widgets, respuestas y assets.

Debe incluir:

- logo o logoUrl
- colores principales
- tono de marca
- firma o cierre sugerido
- links relevantes
- WhatsApp
- website

Reglas:

- no generar todavía widgets ni assets
- no mezclar uploads complejos si no hacen falta
- priorizar un modelo simple, usable y extensible
- validar inputs visibles para evitar basura o contenido inválido

Primero:

1. devolveme plan breve
2. listá modelo, DTOs y endpoints
3. explicá supuestos y validaciones
4. recién después implementá

Al final:

- resumí cambios
- decime cómo esto se conecta con fases futuras
- corré tests afectados

---

Implementemos solo la gestión de usuarios por negocio y roles en Fase 1.

Objetivo:
dejar operativo el esquema owner/admin/operator/viewer para cada negocio.

Debe incluir:

- listar miembros del negocio
- cambiar rol cuando el usuario tenga permiso
- invitar o agregar usuario si el flujo actual del proyecto lo permite
- remover o desactivar acceso si aplica
- enforcement de roles en backend

Roles esperados:

- owner
- admin
- operator
- viewer

Reglas:

- no mezclar panel grande todavía
- no tocar features de Fase 2+
- no romper auth ni memberships existentes
- priorizar seguridad de permisos

Primero:

1. devolveme plan breve
2. explicá la matriz de permisos mínima por rol
3. listá endpoints/DTOs/tests
4. recién después implementá

Al final:

- resumí cambios
- explicame cómo validar permisos por rol
- corré tests afectados

---

Implementemos solo planes y límites lógicos de Fase 1, sin billing real.

Objetivo:
dejar base para restringir capacidad por plan, pero sin cobro automático todavía.

Debe incluir:

- definición de planes
- límites lógicos por plan, por ejemplo:
  - cantidad de sucursales
  - cantidad de usuarios
  - acceso a ciertos módulos
- chequeos simples de límites donde corresponda
- seeds razonables para planes demo

Reglas:

- no implementar suscripciones pagas
- no tocar facturación
- no mezclar billing real ni trials complejos
- mantenerlo simple y suficiente para fases siguientes

Primero:

1. devolveme plan breve
2. listá entidades/campos/reglas
3. explicá dónde conviene enforcement ahora y dónde no
4. recién después implementá

Al final:

- resumí cambios
- listá límites implementados
- decime qué quedó solo modelado y qué quedó enforceado
- corré tests afectados

---

Implementemos solo el panel interno global mínimo para Fase 1.

Objetivo:
tener una vista interna tuya para ver todas las cuentas, sin sobreconstruir.

Debe incluir como mínimo:

- listado de negocios
- estado básico de cuenta
- plan
- cantidad de sucursales
- cantidad de usuarios
- acceso rápido a detalle del negocio

Reglas:

- UI mínima, operativa
- no hacer dashboard bonito
- no meter analytics avanzados
- no mezclar widgets, reviews ni campaigns
- priorizar velocidad y utilidad real

Primero:

1. devolveme estructura propuesta
2. listá rutas, componentes y endpoints necesarios
3. explicá controles de acceso
4. recién después implementá

Al final:

- resumí cambios
- decime qué puede hacer el admin global y qué no
- corré tests afectados y typecheck

---

Implementemos solo seeds demo realistas para Fase 1.

Objetivo:
dejar el producto demostrable y usable para probar UX interna.

Debe incluir:

- varios negocios demo
- diferentes planes
- varias sucursales
- usuarios con roles distintos
- branding cargado en al menos algunos casos
- datos suficientemente realistas para mostrar el producto

Reglas:

- seeds idempotentes
- nombres claros
- datos verosímiles
- no meter basura ni volumen innecesario

Primero:

1. devolveme plan breve
2. listá qué cuentas demo vas a crear
3. explicá qué escenarios va a cubrir cada seed
4. recién después implementá

Al final:

- explicame cómo correr seeds
- listá credenciales demo si aplica
- describí qué escenarios quedan listos para demo

---

Implementemos solo el shell frontend necesario para operar la Fase 1.

Objetivo:
dar soporte mínimo a negocio, sucursales, branding y miembros desde UI.

Debe incluir:

- navegación básica del panel cliente
- pantallas mínimas para negocio
- pantallas mínimas para sucursales
- pantallas mínimas para miembros/roles
- pantallas mínimas para branding
- estados de loading/error/success razonables

Reglas:

- no hacer diseño pesado
- no hacer analytics
- no hacer widgets
- no hacer campaigns ni reviews todavía
- priorizar operación, no estética

Primero:

1. devolveme estructura de rutas
2. listá pantallas y componentes mínimos
3. explicá qué se reutiliza del design system actual
4. recién después implementá

Al final:

- resumí cambios
- decime qué flujos de Fase 1 ya quedan operables desde UI
- corré typecheck/tests afectados

---

Actuá como staff engineer auditando el proyecto contra la definición oficial de Fase 1.

No escribas código.
No modifiques archivos.

La Fase 1 en este proyecto significa:

- CRUD de negocio y sucursales
- perfil de marca
- usuarios por negocio con roles owner/admin/operator/viewer
- planes y límites lógicos
- panel interno global para ver cuentas
- seeds demo realistas

Quiero que revises:

- schema y migraciones
- tenancy
- roles y permisos
- contratos API
- panel interno
- seeds demo
- UX operativa mínima
- deuda técnica que afecte Fase 2

Devolveme únicamente:

1. qué puntos de Fase 1 están efectivamente cumplidos
2. qué puntos siguen flojos o incompletos
3. riesgos reales antes de entrar a Fase 2
4. qué arreglaría sí o sí antes de campañas/QR
5. si Fase 1 ya puede considerarse cerrada o no, con justificación concreta
