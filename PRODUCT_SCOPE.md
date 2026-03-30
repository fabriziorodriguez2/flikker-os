# PRODUCT_SCOPE.md

## 1. Propósito de este documento

Este documento define el alcance real del producto Flikker OS.

Sirve para alinear:

- visión del sistema
- módulos
- prioridades
- qué entra
- qué no entra todavía
- roadmap por fases
- criterios para evitar scope creep

Este archivo existe para que cada decisión de producto tenga contexto y para que Claude Code no invente funcionalidades fuera de foco.

---

## 2. Qué es Flikker OS

Flikker OS es un sistema orientado a ayudar negocios locales a conseguir más clientes desde Google y desde su presencia digital, a través de:

- captación de reseñas
- gestión operativa de reseñas
- respuestas rápidas asistidas
- reutilización de reseñas como prueba social
- widgets para web
- generación de contenido a partir de testimonios
- operación interna por cuenta cliente

No es solamente un software de QR.
No es solamente una web.
No es solamente un panel.
Es un sistema operativo liviano para reputación local y presencia digital.

---

## 3. Problema que resuelve

Muchos negocios locales:

- tienen pocas reseñas
- no piden reseñas de forma consistente
- responden lento o no responden
- no reutilizan testimonios como contenido
- tienen ficha de Google débil
- tienen web débil o sin prueba social
- no saben qué canal o acción les trae mejores resultados

Flikker OS busca resolver eso con una operación simple y repetible.

---

## 4. Resultado de negocio que perseguimos

El producto se diseña para maximizar tres resultados:

1. más reseñas
2. menor tiempo de respuesta
3. más prueba social reutilizable

Resultados secundarios:

- mejor percepción de marca
- más confianza
- mejor conversión desde Google y web
- operación más ordenada por cuenta

---

## 5. Cliente objetivo inicial

### Prioridad 1

Negocios locales donde confianza y reputación pesan mucho:

- salud privada
- dentistas
- estética
- fisioterapia
- nutrición
- psicología

### Prioridad 2

Rubros más accesibles comercialmente:

- gimnasios
- barberías
- cafeterías
- marcas locales
- centros de entrenamiento

---

## 6. Qué vendemos realmente

No vendemos una web suelta.
No vendemos “manejo de redes” genérico.
No vendemos un dashboard por sí mismo.

Vendemos:

- visibilidad local
- confianza
- prueba social
- conversión
- operación digital simple y medible

---

## 7. Dominios del producto

### 7.1 Identity & Access

Incluye:

- usuarios
- sesiones
- memberships
- roles
- permisos
- auditoría de acciones

### 7.2 Business Core

Incluye:

- negocios
- sucursales
- branding
- estado de cuenta
- configuraciones base
- canales de contacto

### 7.3 Review Acquisition

Incluye:

- campañas
- QR dinámicos
- links
- redirecciones
- landings intermedias
- tracking de scans/clicks
- UTMs
- fuentes

### 7.4 Reviews

Incluye:

- ingesta/carga
- almacenamiento
- clasificación
- filtros
- tags
- estados operativos
- detección de duplicados

### 7.5 Responses

Incluye:

- sugerencias con IA
- plantillas por tono y score
- edición humana
- historial
- aprobación
- manejo de negativas

### 7.6 Proof & Distribution

Incluye:

- widgets
- badges
- grillas
- carruseles
- destacados
- embeds para sitios

### 7.7 Content Engine

Incluye:

- generación de copies
- piezas desde reseñas
- plantillas visuales
- exportación
- biblioteca de assets

### 7.8 Analytics

Incluye:

- KPIs por cuenta
- métricas por campaña
- métricas por sucursal
- tendencias
- salud de cuenta
- cortes por periodo y fuente

### 7.9 Client Success / Operación

Incluye:

- onboarding
- tareas
- notas
- alertas
- health score
- soporte
- activity log

### 7.10 Billing

Incluye:

- planes
- suscripciones
- límites
- trial
- upgrades
- impagos

### 7.11 Platform Ops

Incluye:

- logs
- cron jobs
- backups
- observabilidad
- feature flags
- monitoreo

---

## 8. Qué sí hace el producto

### Núcleo funcional

- crear negocios y sucursales
- asignar usuarios y roles
- generar campañas
- generar QR y links de reseñas
- registrar eventos de captación
- almacenar y clasificar reseñas
- sugerir respuestas
- escalar negativas
- seleccionar reseñas destacadas
- embebir widgets
- generar activos simples desde reseñas
- medir uso básico
- operar cuentas desde panel interno

### Valor comercial directo

- ayudar a pedir más reseñas
- ayudar a responder mejor
- ayudar a mostrar reputación en web
- ayudar a reutilizar testimonios como marketing
- ayudar a ordenar operación por cliente

---

## 9. Qué NO hace todavía

Esto queda fuera en la etapa inicial:

- CRM complejo
- app móvil
- inbox omnicanal tipo Podium
- campañas pagas
- gestión integral de redes
- automatizaciones profundas con Instagram/Facebook
- analítica enterprise sofisticada
- auto-registro completo self-service
- builder visual complejo de websites
- e-commerce completo dentro del sistema
- funnels complejos de marketing automation
- sistema de mensajería multicanal grande
- billing enterprise con escenarios especiales raros

---

## 10. MVP operativo real

Antes de pensar en plataforma enorme, el MVP operativo útil debe cubrir:

1. negocios / sucursales
2. QR o links por campaña
3. tracking básico
4. carga / listado de reseñas
5. sugerencia de respuesta con IA
6. widget simple de testimonios
7. panel interno mínimo

Este MVP debe poder venderse, mostrarse y operarse aunque todavía no sea bonito.

---

## 11. Regla oficial sobre UI y frontend

La UI no es prioridad por encima del negocio.

Regla:

> El frontend se implementa solo cuando una funcionalidad lo necesita para poder usarse, probarse o venderse. En esa situación, se hace el mínimo indispensable. El refinamiento visual queda para una etapa posterior.

Eso implica:

- formularios simples
- tablas simples
- filtros simples
- dashboards básicos
- componentes reutilizables razonables
- cero sobreingeniería visual en la etapa inicial

La pregunta correcta no es “¿queda hermoso?”
La pregunta correcta es “¿ya permite operar el flujo sin fricción absurda?”

---

## 12. Fases del producto

## Fase 0 — Fundación técnica

Objetivo:
dejar una base arrancable, limpia y segura.

Incluye:

- monorepo
- configuración base
- auth
- tenant base
- seeds demo
- observabilidad mínima
- estructura de carpetas
- calidad básica del repo

Entregable:
cualquier desarrollador puede levantar el proyecto y entrar a una base operativa.

---

## Fase 1 — Core de negocio

Objetivo:
modelar la cuenta cliente real sobre la que vive todo lo demás.

Incluye:

- negocios
- sucursales
- branding
- usuarios
- roles
- memberships
- planes lógicos básicos
- panel interno de cuentas

Entregable:
una cuenta real usable con estructura organizativa mínima.

---

## Fase 2 — Captación

Objetivo:
crear el motor de adquisición de reseñas trazable.

Incluye:

- campaigns
- qr_codes
- redirecciones
- links
- fuentes
- tracking de scans/clicks
- descarga de QR
- métricas básicas de captación

Entregable:
cada QR o link debe ser medible y atribuible.

---

## Fase 3 — Reseñas

Objetivo:
construir inbox/base operativa de reviews.

Incluye:

- modelo review
- review_source
- review_tag
- review_status
- filtros
- timeline
- duplicados
- carga manual o sync base
- clasificación simple

Entregable:
una cola ordenada y utilizable de reseñas.

---

## Fase 4 — Respuestas

Objetivo:
resolver el tiempo de respuesta y la operación de reviews sensibles.

Incluye:

- tono por negocio
- plantillas por score
- sugerencias IA
- edición
- aprobación
- histórico de versiones
- escalado de negativas
- SLA simple

Entregable:
responder reseñas más rápido y con consistencia.

---

## Fase 5 — Prueba social

Objetivo:
reutilizar reseñas de forma visible en el sitio o activos externos.

Incluye:

- widgets
- grillas
- carruseles
- badge de rating
- destacados
- configuración por negocio
- métricas de impresiones y clics

Entregable:
mostrar reputación real fuera del inbox.

---

## Fase 6 — Contenido

Objetivo:
transformar reseñas en contenido simple reutilizable.

Incluye:

- copies
- captions
- piezas base
- stories
- posts
- exportaciones
- biblioteca de assets

Entregable:
pasar de “reseña guardada” a “activo de marketing reusable”.

---

## Fase 7 — Analytics

Objetivo:
medir adopción, crecimiento e impacto operativo.

Incluye:

- nuevas reseñas
- promedio estrellas
- tiempo de respuesta
- tasa de respuesta
- scans
- clicks
- tendencia semanal/mensual
- health score

Entregable:
una lectura clara del estado de cada cuenta.

---

## Fase 8 — Operación

Objetivo:
ordenar gestión interna de clientes.

Incluye:

- onboarding checklist
- notas
- tareas
- alertas
- admin global
- activity log
- vista de cuentas sanas vs en riesgo

Entregable:
operación interna más prolija y escalable.

---

## Fase 9 — Billing

Objetivo:
monetización controlada y límites por plan.

Incluye:

- suscripciones
- trial
- upgrades
- historial
- impagos
- limitación elegante

Entregable:
base para recurrencia robusta.

---

## Fase 10 — Robustez

Objetivo:
hacer el sistema más resistente.

Incluye:

- hardening
- performance
- seguridad
- backups
- rate limits
- restore
- feature flags
- E2E críticos

Entregable:
producto menos frágil y más desplegable.

---

## 13. Épicas maestras

- Auth & tenancy
- Business profile
- Campaign engine
- Review inbox
- Response assistant
- Widget engine
- Content studio
- Analytics suite
- Client success
- Billing & plans
- Platform ops

---

## 14. Orden real de prioridad

Prioridad actual real del proyecto:

1. fundación técnica
2. auth + tenancy
3. business core
4. campaigns + QR
5. reviews
6. responses
7. widgets
8. operación básica
9. analytics
10. billing
11. hardening

---

## 15. Qué evita scope creep

No hacer estas cosas antes de tiempo:

- rehacer stack
- perseguir todos los nichos
- agregar mil variantes visuales
- hacer dashboards complejos sin datos confiables
- construir front premium sin backend resuelto
- meter automatizaciones externas grandes antes de validar operación
- mezclar reputación, CRM, social media y ventas en un monstruo único

---

## 16. Criterio de “listo” por módulo

Un módulo se considera listo cuando tiene:

- objetivo claro
- modelo y reglas definidos
- endpoints funcionando
- validaciones
- permisos
- tests mínimos
- frontend mínimo indispensable si lo requiere
- errores razonables
- documentación del módulo

No está listo solo porque “se ve”.

---

## 17. Posicionamiento comercial resumido

Promesa comercial base:

> Ayudamos a negocios locales a conseguir más clientes desde Google con mejor presencia, más reseñas y mejor prueba social.

Flikker OS es la capa operativa que sostiene esa promesa.

---

## 18. Resumen brutalmente práctico

El producto no debe nacer como una plataforma gigante.
Debe nacer como una máquina simple para:

- captar reseñas
- operarlas bien
- responder rápido
- mostrarlas mejor
- convertirlas en activos reutilizables

Todo lo que no ayude a eso, por ahora, es secundario.
