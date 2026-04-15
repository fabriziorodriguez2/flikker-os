# CLAUDE.md

## 1. Propósito de este archivo

Este archivo define cómo debe trabajar Codex dentro de este repositorio.

Su función no es describir todo el producto ni toda la arquitectura.
Su función es actuar como manual operativo del agente para colaborar sin romper el foco del MVP, sin abrir scope innecesario y sin introducir caos técnico.

Codex debe usar este archivo como guardrail principal antes de proponer, modificar o extender código.

---

## 2. Qué es Flikker en esta etapa

Flikker, en esta etapa, es un MVP multi-tenant orientado a validar un flujo operativo simple de reputación:

`negocio activo -> campaña o QR trazable -> evento -> reseña cargada manualmente -> reseña destacada o respondida -> widget embebido -> métricas mínimas`

### Qué sí es

- una app web interna con backend modular
- un sistema con tenancy desde el día uno
- una herramienta para crear campañas trazables
- una base operativa de reseñas
- una capa mínima para responder reseñas
- una forma simple de exponer prueba social con widgets
- una capa básica de métricas para validar uso

### Qué no es

- una plataforma completa de reputación local
- un CRM
- un content studio
- un sistema avanzado de IA
- un producto de analytics amplio
- un sistema de billing
- una suite de client success
- un page builder
- un sistema de automatizaciones complejas

Si una propuesta empuja a Flikker hacia alguna de esas direcciones en esta fase, está fuera de foco salvo pedido explícito.

---

## 3. Scope actual del MVP

El scope actual del MVP incluye solo lo necesario para cerrar el flujo principal.

### En scope

- auth
- memberships
- business activo
- campaigns
- QR o link trazable
- tracking básico de eventos
- carga manual de reseñas
- listado y detalle de reseñas
- respuesta mínima a reseñas
- reseñas destacadas
- widgets embebibles simples
- métricas mínimas del flujo

### Fuera de scope por ahora

- IA avanzada de respuestas
- plantillas complejas
- workflows de aprobación complejos
- content studio
- assets de marketing
- analytics avanzadas
- health score
- billing
- planes y límites comerciales
- client success
- onboarding interno complejo
- automatizaciones complejas
- integraciones grandes

### Regla

Codex no debe construir features fuera de este scope sin instrucción explícita.

---

## 4. Stack real del repo

### Frontend

- Next.js
- TypeScript
- App Router
- Tailwind CSS

### Backend

- NestJS
- TypeScript

### Base de datos

- PostgreSQL

### ORM

- Prisma

### Testing

- tests unitarios en TypeScript
- tests de integración y contrato en API
- E2E mínimo del flujo principal

### Regla

No reabrir decisiones de stack sin un problema real y documentable.

---

## 5. Convenciones generales de trabajo

### Regla 1

Pensar antes de tocar.

### Regla 2

Mantener los cambios enfocados.

### Regla 3

No tocar archivos no relacionados.

### Regla 4

No construir por anticipación.

### Regla 5

Priorizar claridad, seguridad y mantenibilidad sobre sofisticación.

### Regla 6

Si una tarea es grande, dividirla antes de implementarla.

### Regla 7

Si algo puede resolverse manualmente sin romper el MVP, no automatizarlo todavía.

### Regla 8

No introducir nuevas dependencias sin justificar claramente:

- por qué hacen falta ahora
- qué problema resuelven
- por qué no alcanza con el stack actual

### Regla 9

Siempre listar riesgos y pendientes al cerrar una tarea.

---

## 6. Regla de plan previo antes de tocar código

Antes de hacer cambios relevantes, Codex debe devolver primero un plan corto y concreto.

Ese plan debe incluir:

- objetivo
- archivos a tocar
- pasos
- riesgos
- tests a crear o correr
- qué no se tocará

### Regla práctica

No empezar escribiendo código grande sin ese plan previo.

### Excepción razonable

Si la tarea es mínima, localizada y de bajo riesgo, el plan puede ser breve, pero igual debe existir.

---

## 7. Regla de PRs chicos y una sola intención de cambio

Cada tanda de trabajo debe tener una sola intención principal.

Ejemplos válidos:

- agregar un endpoint puntual
- cerrar un flujo mínimo de un módulo
- ajustar una validación
- corregir tenancy en una query
- sumar una pantalla mínima necesaria

Ejemplos inválidos:

- mezclar migration + refactor grande + UI grande
- mezclar auth + billing + refactor transversal
- mezclar redesign visual + cambio de reglas de negocio
- tocar muchos módulos sin un hilo claro

### Regla

Si una tarea pide demasiado en una sola tanda, dividir antes de implementar.

---

## 8. Reglas estrictas de tenancy y permisos

Multi-tenancy y permisos son obligatorios desde el día uno.

### Reglas no negociables

1. Nunca confiar en el frontend para tenancy.
2. Nunca confiar en el rol enviado por el cliente.
3. Toda ruta privada debe validar el `business` activo.
4. Toda entidad sensible debe quedar scopeada a `businessId` o derivarse de una entidad que ya lo tenga.
5. Nunca devolver datos de otro tenant por conocer un ID.
6. Los permisos se resuelven en backend.
7. Toda query sensible debe revisar membership y rol.
8. Los endpoints públicos nunca deben filtrar datos internos del tenant.

### Riesgos que Codex debe revisar siempre

- acceso cross-tenant por ID directo
- falta de filtro por `businessId`
- relaciones entre entidades de distintos negocios
- widgets públicos exponiendo metadata interna
- permisos resueltos solo en frontend

---

## 9. Reglas para migrations

Las migrations deben ser chicas, claras y justificadas.

### Regla 1

No mezclar migration + refactor grande + UI grande en la misma tanda.

### Regla 2

No abrir tablas o columnas para futuros congelados.

### Regla 3

No modelar complejidad por anticipación.

### Regla 4

Nombrar migraciones de forma entendible.

### Regla 5

Revisar siempre:

- claves foráneas
- índices mínimos necesarios
- nullability
- defaults
- impacto en tenancy

### Regla 6

Si la tarea es solo de modelo, no adelantar UI ni refactors laterales salvo pedido explícito.

---

## 10. Reglas para tests

Codex debe pensar en tests cada vez que implementa algo relevante.

### Obligatoriedad mínima

No se considera bien cerrada una tarea si rompe:

- typecheck
- lint
- tests relacionados

### Qué testear primero

- reglas puras
- validaciones
- permisos
- tenancy
- endpoints críticos
- flujo principal del MVP

### Prioridades de testing

#### Unit

Para:

- helpers
- validaciones puras
- reglas simples de estado

#### Integration

Para:

- auth
- switch business
- campaigns
- tracking básico
- reviews
- responses mínimas
- widgets
- bloqueo cross-tenant

#### Contract

Para endpoints críticos de API.

#### E2E

Mínimo obligatorio:

`login -> campaña -> QR o link -> evento -> reseña -> widget`

### Regla

Si no se agregan tests por una razón válida, Codex debe decirlo explícitamente.

---

## 11. Módulos activos y módulos congelados

### Módulos activos

- auth
- memberships
- businesses
- campaigns
- tracking o events
- reviews
- responses mínimas
- widgets
- analytics mínimas

### Módulos congelados

- billing
- content studio
- assets de marketing
- IA avanzada de responses
- approvals complejos
- analytics avanzadas
- health score
- client success
- onboarding interno complejo
- notifications complejas
- automatizaciones complejas
- CRM
- inbox omnicanal

### Regla

No crear carpetas, tablas, servicios o endpoints para módulos congelados salvo pedido explícito.

---

## 12. Convenciones para frontend

El frontend del MVP debe ser mínimo y funcional.

### Sí hacer

- formularios simples
- tablas simples
- feedback claro de loading, error y success
- pantallas que permitan operar el flujo

### No hacer

- rediseños visuales grandes sin necesidad
- animaciones irrelevantes
- componentes hiperabstractos prematuros
- dashboards lindos sin datos confiables
- builder visual complejo para widgets

### Regla

El frontend existe para habilitar el flujo, no para competir por polish visual en esta etapa.

---

## 13. Formato en que Codex debe responder

Cuando reciba un pedido técnico relevante, Codex debe responder de forma ordenada y breve.

### Antes de implementar

Debe incluir:

- objetivo
- archivos a tocar
- plan por pasos
- riesgos
- tests
- qué no se tocará

### Después de implementar

Debe incluir:

- cambios realizados
- archivos tocados
- tests corridos
- riesgos
- pendientes
- siguiente subpaso recomendado

### Regla

Siempre listar riesgos y pendientes, aunque sean pocos.

---

## 14. Checklist antes de cerrar una tarea

Antes de cerrar, Codex debe revisar:

- el cambio cumple el scope del MVP
- no se tocaron archivos no relacionados
- no se mezclaron demasiadas intenciones en la misma tanda
- tenancy sigue correcta
- permisos siguen correctos
- DTOs y validaciones siguen consistentes
- no se introdujeron dependencias nuevas sin justificar
- migraciones, si existen, son chicas y coherentes
- typecheck, lint y tests relacionados no quedan rotos
- la documentación relevante quedó actualizada si correspondía
- quedaron explícitos riesgos y pendientes

---

## 15. Errores que Codex no debe cometer

Evitar completamente:

- tocar archivos no relacionados
- construir features fuera del scope
- mezclar migration + refactor grande + UI grande
- introducir nuevas dependencias sin justificar
- resolver tenancy desde frontend
- asumir un solo tenant
- hacer refactors cosméticos grandes
- abrir infraestructura nueva sin necesidad real
- modelar módulos congelados "por si después hacen falta"
- hacer cambios gigantes sin dividir la tarea
- cerrar una tarea sin listar riesgos y pendientes
- esconder dudas importantes en vez de explicitarlas

---

## 16. Qué hacer si una tarea es demasiado grande

Si la tarea es demasiado grande para una sola tanda segura:

1. dividir en subpasos mergeables
2. proponer primero la tanda más chica que cierre valor real
3. explicitar riesgos y dependencias
4. no intentar resolver todo de una

### Regla

Siempre preferir avance pequeño, usable y seguro sobre avance enorme e incierto.

---

## 17. Criterio de calidad del repo

El estándar de este repo no es complejidad.
Es progreso ordenado.

Queremos:

- código claro
- cambios chicos
- flujo usable
- tenancy correcta
- seguridad razonable
- backend sólido
- frontend suficiente

No queremos:

- brillantez innecesaria
- amplitud prematura
- arquitectura inflada
- documentación desacoplada del scope real

---

## 18. Plantilla corta de respuesta de Codex ante un pedido técnico

```md
Objetivo
- [resumir qué se busca resolver]

Archivos a tocar
- [archivo 1]
- [archivo 2]

Plan
1. [paso 1]
2. [paso 2]
3. [paso 3]

Riesgos
- [riesgo 1]
- [riesgo 2]

Tests
- [test a crear o correr]

No voy a tocar
- [fuera de alcance en esta tanda]
```

---

## 19. Plantilla de plan de implementación

```md
Objetivo
- [objetivo funcional concreto]

Alcance
- [qué entra]
- [qué no entra]

Archivos o áreas afectadas
- [ruta o módulo]
- [ruta o módulo]

Plan por pasos
1. Revisar reglas de negocio y contratos existentes.
2. Ajustar modelo de datos o DTOs si hace falta.
3. Implementar lógica de dominio o endpoint mínimo.
4. Agregar o actualizar tests relacionados.
5. Sumar frontend mínimo solo si el flujo lo necesita.
6. Verificar tenancy, permisos y errores.

Riesgos
- [riesgo técnico]
- [riesgo de negocio]

Tests a crear o correr
- [unit]
- [integration]
- [contract o E2E si aplica]

Fuera de alcance
- [feature o refactor que no se tocará]

Pendientes esperables
- [pendiente 1]
- [pendiente 2]
```
