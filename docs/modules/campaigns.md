# campaigns.md

## 1. Objetivo del módulo

El módulo `campaigns` es uno de los núcleos del MVP.

Su trabajo es simple pero crítico:

- crear campañas trazables
- generar un QR o link trazable
- redirigir al destino correcto
- registrar eventos mínimos de uso
- permitir saber qué canal o punto de captación está funcionando

La idea central es esta:

**Si no sé qué campaña o QR funciona, estoy ciego comercialmente.**

Este módulo existe para evitar esa ceguera.

No es un sistema de marketing automation.
No es un ads manager.
No es una analítica enterprise.
Es la base operativa para atribuir captación de reseñas en pilotos reales.

---

## 2. Entidades y estados

El módulo debe mantenerse chico y orientado al flujo real.

### 2.1 Campaign

Representa una iniciativa concreta de captación.

Ejemplos:

- QR de mostrador
- QR de caja
- link post compra
- link por WhatsApp
- campaña para evento puntual

Campos mínimos sugeridos:

- `id`
- `businessId`
- `name`
- `slug`
- `status`
- `channel`
- `sourceLabel` opcional
- `createdAt`
- `updatedAt`

### Estados válidos de `Campaign`

- `draft`
- `active`
- `inactive`

### Nota

No hace falta abrir más estados si no cambian una operación real del MVP.

---

### 2.2 QrCode

Representa el activo trazable que puede imprimirse, descargarse o compartirse.

No hace falta que sea sofisticado.
Puede ser una entidad persistida o una representación simple asociada a la campaña.

Campos mínimos sugeridos:

- `id`
- `businessId`
- `campaignId`
- `slug` o `publicCode`
- `status`
- `createdAt`

### Estados válidos de `QrCode`

- `active`
- `inactive`

---

### 2.3 RedirectTarget

Define hacia dónde termina yendo el usuario cuando usa el QR o link trazable.

Puede ser:

- URL de reseña de Google
- URL custom simple
- una landing intermedia futura

Campos mínimos sugeridos:

- `id`
- `businessId`
- `campaignId`
- `targetType`
- `targetUrl`
- `isActive`

### Tipos mínimos de `targetType`

- `google_review`
- `custom_url`

No hace falta abrir más variantes en esta etapa.

---

### 2.4 QrEvent

Registra el evento mínimo de uso.

No necesita ser una tabla analítica compleja.
Necesita capturar suficiente contexto para contar y atribuir.

Campos mínimos sugeridos:

- `id`
- `businessId`
- `campaignId`
- `qrCodeId` opcional si existe entidad separada
- `eventType`
- `occurredAt`
- `referrer` opcional
- `userAgent` opcional
- `metadataJson` opcional

### Eventos mínimos válidos

- `scan`
- `redirect`

Si ambos terminan siendo el mismo punto técnico, igual conviene conservar la semántica para reporting mínimo.

---

## 3. Flujo principal

El flujo principal del módulo debe ser este:

1. usuario entra al negocio activo
2. crea campaña
3. define canal o fuente
4. asocia un destino de redirect
5. obtiene un link trazable
6. genera QR a partir de ese link, o descarga una representación simple
7. alguien usa ese link o QR
8. el sistema registra el evento
9. el sistema redirige al destino final
10. luego esa campaña puede asociarse a una reseña cargada manualmente

### Regla

El valor del módulo no está en la estética del QR.
Está en la trazabilidad.

---

## 4. Endpoints mínimos

El módulo necesita endpoints que permitan operar de punta a punta.

### Privados

- `POST /campaigns`
  Crear campaña.

- `GET /campaigns`
  Listar campañas del negocio activo con filtros básicos.

- `GET /campaigns/:campaignId`
  Ver detalle de una campaña.

- `PATCH /campaigns/:campaignId`
  Editar nombre, canal, slug o destino simple.

- `PATCH /campaigns/:campaignId/status`
  Activar o inactivar campaña.

- `GET /campaigns/:campaignId/qr`
  Obtener link trazable y, si aplica, payload o imagen simple del QR.

- `GET /campaigns/:campaignId/metrics`
  Ver métricas mínimas de esa campaña.

### Públicos

- `GET /r/:slug`
  Resolver link trazable, registrar evento y redirigir.

### Opcionales pero útiles

- `POST /campaigns/:campaignId/qr/regenerate`
  Solo si existe necesidad real de regenerar código o slug.

### Regla

No abrir endpoints de UTMs avanzadas, funnels, comparativas complejas o landings brandizadas en esta etapa.

---

## 5. Eventos a registrar

No hace falta un event bus.
Sí hace falta registrar bien los eventos mínimos.

### Eventos mínimos recomendados

- `campaign.created`
- `campaign.updated`
- `campaign.activated`
- `campaign.inactivated`
- `qr.generated`
- `tracking.scan_recorded`
- `tracking.redirect_recorded`

### Importante

Estos eventos pueden vivir como:

- logs estructurados
- tabla de eventos mínimos
- activity log simple

No hace falta infraestructura asíncrona para cumplir el MVP.

---

## 6. Métricas mínimas

La métrica de este módulo debe ser mínima pero útil.

### Métricas por campaña

- cantidad de scans
- cantidad de redirects
- fecha de último uso
- canal o fuente
- estado actual

### Métricas agregadas simples

- campañas activas
- campañas inactivas
- campañas nunca usadas

### Regla

No construir ahora:

- análisis por dispositivo sofisticado
- funnel complejo
- cohortes
- UTMs avanzadas
- dashboards de analítica enterprise

Con saber qué campaña se usa y cuál no, ya ganamos visibilidad comercial valiosa.

---

## 7. UI mínima

La UI debe ser extremadamente operativa.

### Pantallas mínimas

#### 1. Listado de campañas

Debe mostrar:

- nombre
- canal
- slug o identificador trazable
- estado
- cantidad básica de eventos
- acción para abrir

#### 2. Formulario de creación

Debe pedir:

- nombre
- canal
- slug o generar uno
- destino final

#### 3. Detalle de campaña

Debe mostrar:

- datos base
- link trazable
- acceso a QR
- métricas mínimas
- estado

#### 4. Acción rápida de activar o inactivar

Desde una UI simple.

### Regla UI

No convertir esto en un constructor visual de campañas.
No hace falta una landing bonita para validar el módulo.

---

## 8. Edge cases

### Caso 1

Dos campañas intentan usar el mismo slug.

### Resolución

Constraint único y validación previa.

---

### Caso 2

Una campaña inactiva sigue redirigiendo.

### Resolución

El endpoint público debe validar estado y decidir si bloquea, responde error controlado o redirige según política simple.

---

### Caso 3

Se cambia el destino de una campaña después de imprimir el QR.

### Resolución

El QR debe apuntar al link trazable estable, no al destino final directo.

---

### Caso 4

Se registran múltiples eventos por refresh o bots.

### Resolución

Aceptar que la métrica del MVP es básica.
No meter ahora lógica sofisticada anti-fraude salvo rate limiting y validaciones mínimas.

---

### Caso 5

Una reseña se asocia a la campaña equivocada.

### Resolución

Permitir corrección manual posterior desde el módulo de reseñas si el negocio lo necesita.

---

### Caso 6

El negocio no tiene todavía URL de Google Review definitiva.

### Resolución

Permitir `custom_url` o carga manual del destino mientras se completa después.

---

## 9. Tests mínimos

### Unit

- validación de slug
- validación de estados
- validación simple de target URL

### Integration

- crear campaña dentro del negocio correcto
- impedir acceso a campaña de otro tenant
- generar link trazable
- registrar evento al resolver slug
- redirigir al destino correcto
- bloquear o manejar campañas inactivas correctamente

### Contract

- `POST /campaigns`
- `GET /campaigns`
- `GET /campaigns/:campaignId`
- `PATCH /campaigns/:campaignId`
- `PATCH /campaigns/:campaignId/status`
- `GET /r/:slug`

### E2E mínimo relacionado

- login
- crear campaña
- obtener QR o link
- usar link público
- verificar que se registra evento

---

## 10. Fuera de alcance

Queda fuera de este módulo por ahora:

- landing intermedia brandizada
- UTMs complejas
- analítica avanzada por dispositivo
- funnel detallado
- atribución sofisticada
- sucursal avanzada
- comparativas complejas entre canales
- automatizaciones de campañas
- A/B testing
- constructor visual
- integraciones de marketing complejas

### Regla final

Este módulo no tiene que impresionar.
Tiene que responder una pregunta básica y crítica:

**qué campaña o QR está generando uso real y cuál no**
