# Flikker — Product Definition

> **Source of truth de producto.** Reconstruido desde el código real (schema, controllers,
> servicios, workers y UI), no desde documentación previa.
> Última reconstrucción: agosto 2026.

**Relación con otros documentos del repo:**

- `PRODUCT_SCOPE.md` describe la etapa anterior de Flikker (captación y gestión de reseñas
  para reputación local). Sigue siendo válido como registro histórico y como guardrail de
  scope del MVP original, **pero ya no describe el producto que Flikker vende hacia
  adelante.** Ante contradicción, manda este archivo.
- `CLAUDE.md` es el manual operativo del agente. No define producto.
- `ARCHITECTURE.md` define cómo está construido. No define producto.

---

## Qué es Flikker

Un negocio pone un QR (o un sticker NFC) en el mostrador. Cada vez que un cliente lo
escanea, Flikker lo reconoce, le suma un sello, y le muestra cuánto le falta para su
próxima recompensa. Cuando ese cliente deja de aparecer, Flikker le manda un WhatsApp para
intentar traerlo de vuelta.

Eso es todo el producto. El resto — reseñas, campañas, widgets, métricas — orbita alrededor
de ese gesto.

### De dónde sale esta definición

El repo contiene dos productos superpuestos:

- **`LEGACY`** — generador de reseñas de Google: QR → capturar contacto → WhatsApp pidiendo
  reseña. Es el producto original, orientado a clínicas y salud.
- **`CHECKIN_V2`** — sistema de recurrencia: QR → check-in → sellos → recompensa → canje,
  más un motor que detecta ausencias y reactiva.

Todo el desarrollo reciente vive en el segundo. Este documento describe `CHECKIN_V2`.

---

## Para quién es

| Rol | Qué hace | Qué ve | Qué NO debería entender |
|---|---|---|---|
| **Cliente del local** | Escanea el QR en cada visita. Opcionalmente responde "¿cómo fue tu experiencia?". Muestra un QR para canjear. | `/check-in/{token}` y `/mi-flikker`. Sin app, sin contraseña — se lo reconoce por cookie de sesión persistente. | Que existe una "meta", un "segmento", un experimento o un motor. Solo ve sellos y una recompensa. |
| **Empleado** | Una sola tarea: confirmar canjes, escaneando el QR del cliente con la cámara nativa del teléfono. | `/redeem/{token}` — nombre del beneficio, nombre del cliente, un botón. | Todo lo demás. No necesita entrar al panel para operar. |
| **Dueño / admin** | Mira resultados. Crea beneficios. Enciende o apaga recompensas y retención. | Panel, Insights, Clientes, Campañas, Reseñas, Beneficios, Retención, Check-ins. | Segmentos, variantes, uplift, allocation, dry-run, p-values. |
| **Operador Flikker** | Onboarding completo del negocio: lo crea, configura, importa clientes, conecta Google, genera el QR, prende el producto. | `/platform` + impersonación. | — |

### Flikker hoy es un producto asistido, no autoservicio

En `apps/web/app/(panel)/sidebar.tsx`, los ítems **QR** y **Widget** están marcados
`impersonatorOnly: true` — un dueño normal nunca los ve. Y
`apps/api/src/modules/platform/platform.controller.ts` expone el onboarding entero: crear
negocio, setear `experienceVersion`, cargar datos, conectar Google, importar clientes,
configurar plantillas, mandar mensaje de prueba, completar onboarding.

**El negocio no se da de alta solo — Flikker lo instala.** Es una decisión legítima para un
piloto, pero define el modelo de negocio (concierge / alto contacto) y hoy no está declarada
en ningún lado.

### Qué negocios encajan

Calibrado para **alta frecuencia y ticket bajo**: cafeterías, panaderías, heladerías,
barberías, comida rápida. Tres señales del código:

- `checkinMinHoursBetweenVisits` default **8 horas** y `checkinMaxVisitsPerDay` **1**
  (`prisma/schema.prisma`) — asume que alguien podría venir varias veces por semana.
- Targets de sellos por defecto de 1 a 5 visitas (`reward-goal-rules.ts`) — solo tiene
  sentido si volver es barato y frecuente.
- Retención mide "volvió o no" en ventanas de días, no de meses
  (`retention-outcome.service.ts`).

**No encaja** en baja frecuencia (clínica dental, consultorio): una tarjeta de 5 sellos
donde el cliente viene dos veces al año no es un incentivo, es una frustración.

---

## Problema principal

El negocio no sabe quién vuelve, y no tiene forma de influir en que vuelva.

Un café chico atiende 200 personas por día y no sabe si son 200 personas distintas o 40 que
vuelven cinco veces. No tiene registro, no tiene contacto, y cuando alguien deja de venir no
se entera nunca.

### Los cuatro problemas, por peso real en el producto

| Problema | Rol | Dónde vive |
|---|---|---|
| **B · Lograr que vuelva con incentivos** | **Núcleo.** Es la promesa que el cliente ve y entiende. Todo el desarrollo reciente está acá. | `modules/reward-goals/*`, `modules/benefits/*`, `checkin-client.tsx` |
| **D · Medir visitas y recurrencia** | **Núcleo (habilitante).** Sin `Visit` no existe ni el sello ni la detección de ausencia. Es el dato que Flikker crea y nadie más tiene. | `modules/checkin/visits.repository.ts`, `modules/checkin-metrics/*` |
| **C · Detectar y reactivar** | **Complementario de alto valor.** Muy construido, apagado por defecto, sin validar. | `modules/retention-v2/*` |
| **A · Conseguir reseñas** | **Herencia.** Era el producto original. Hoy acompaña, no es la razón de compra. | `modules/reviews/*`, `jobs/workers/review-request.worker.ts` |

El núcleo real es **B + D juntos**: medir la visita y convertirla inmediatamente en un
incentivo visible. Ni la medición sola (eso es analytics) ni el incentivo solo (eso es una
tarjetita de cartón) constituyen el producto.

---

## Propuesta de valor

**A · Diez palabras o menos**
> Convertí clientes de una vez en clientes que vuelven.

**B · Una oración**
> Flikker le da a cada cliente una razón concreta para volver a tu local, y te avisa —y los
> contacta— cuando dejan de venir.

**C · Pitch de 20 segundos**
> "¿Sabés cuántos de los que entraron hoy ya habían venido antes? Nadie lo sabe. Flikker
> pone un QR en tu mostrador: el cliente lo escanea, suma un sello, y ve que le faltan tres
> para su café gratis. Vos por primera vez ves quién vuelve y quién no. Y al que dejó de
> venir, Flikker le escribe."

**D · Un minuto, para un dueño**
> "Hoy tu cliente entra, paga y se va, y no queda nada. Si vuelve la semana que viene no te
> enterás, y si deja de venir tampoco.
>
> Flikker es un QR en el mostrador. El cliente lo escanea la primera vez, deja nombre y
> teléfono en diez segundos, y desde ahí el teléfono se acuerda de él: cada vez que vuelve,
> escanea y suma un sello. A los cinco sellos se le desbloquea lo que vos hayas puesto — un
> café gratis, un descuento, lo que sea. Cuando lo quiere usar, te muestra un QR, tu
> empleado lo escanea con la cámara del teléfono y listo.
>
> Vos, del otro lado, ves algo que antes no existía: cuántos clientes activos tenés, quiénes
> son los que vuelven, y cuántos se están enfriando. Y a esos que se enfrían, Flikker les
> manda un WhatsApp para intentar recuperarlos. Sin que vos hagas nada."

**E · Landing page**
> **Tus clientes vuelven. Ahora podés verlo — y provocarlo.**
>
> Un QR en el mostrador convierte cada visita en un sello. Tus clientes ven cuánto les falta
> para su recompensa. Vos ves quién vuelve, quién se está yendo, y cuánto vale eso. Y cuando
> alguien deja de aparecer, Flikker le escribe por WhatsApp para traerlo de vuelta.
>
> Sin app que descargar. Sin plástico. Sin puntos que nadie entiende.

**F · Antes / Con Flikker**

| Antes de Flikker | Con Flikker |
|---|---|
| No sabés si el que entró hoy ya vino antes. | Cada visita queda registrada con nombre y teléfono. |
| Tu cliente no tiene motivo para elegirte mañana en vez del café de la esquina. | Tu cliente sabe que le faltan dos sellos y vuelve por eso. |
| Si alguien deja de venir, te enterás nunca. | Al que se enfría le llega un mensaje sin que hagas nada. |
| Tu única herramienta de fidelidad es acordarte de la cara. | Ves clientes activos, recurrentes y recuperados en un panel. |
| Las reseñas llegan cuando llegan. | A cada cliente se le pide su opinión, y de ahí salen reseñas. |

---

## Cómo funciona

Tres piezas: un token, una visita y una promesa.

**El token.** Cada punto físico del local (mostrador, mesa, sticker NFC) es un `VisitSource`
con un token opaco. Escanearlo abre `/check-in/{token}`. Ese token identifica al *negocio*,
nunca al cliente.

**La visita.** Quién es el cliente se resuelve por una `CustomerSession`: una cookie httpOnly
de la que solo se guarda el hash (`customer-sessions.repository.ts`). Si el navegador la
trae, es un cliente conocido y se registra una `Visit`. Si no, se le pide nombre y teléfono
una única vez.

**La promesa.** Un `CustomerRewardGoal` activo dice "te faltan N sellos para X". Cada `Visit`
posterior a su activación suma. Al llegar al target, se emite un `BenefitParticipation` con
un código de canje único.

> **La decisión técnica que define el producto:** la identidad del cliente **no** es una
> cuenta con contraseña, sino un teléfono verificado por WhatsApp (`FlikkerAccount`) más una
> cookie persistente por negocio. Por eso el flujo es de diez segundos y no requiere app.
> Todo depende de que ese reconocimiento no falle: si se pierde la cookie, hay recuperación
> por OTP (`checkin.service.ts → recoverStart/recoverVerify`).

---

## El loop de recurrencia

| # | Quién | Qué pasa | Dónde |
|---|---|---|---|
| 1 | Cliente | Entra al local y escanea el QR del mostrador | `checkin.service.ts → resolveLanding` |
| 2 | Sistema | ¿Lo reconoce? Cookie → sí. Si no, formulario de nombre + teléfono (una sola vez) | `customer-sessions.repository.ts` |
| 3 | Sistema | Registra la visita, con dedup: mín. 8 h entre visitas, máx. 1 por día | `visits.repository.ts` |
| 4 | **Cliente** | **Ve sus sellos y cuánto le falta** — "Te faltan 2 sellos para tu cappuccino gratis · 3 de 5" | `RewardGoalCard` |
| 5 | Cliente | Responde "¿Cómo fue tu experiencia?" → gana 1 sello extra (si está activado) | `CheckinFeedback` + `RewardGoalBonusStamp` |
| 6 | Cliente | Si puntuó alto, se le ofrece dejar reseña en Google. El sello ya se otorgó antes | `checkin-feedback-card.tsx` |
| 7 | Cliente | Vuelve. Escanea. Suma | `reward-goal-unlock.service.ts` |
| 8 | **Sistema** | **Tarjeta completa → recompensa desbloqueada.** Transición atómica `ACTIVE → UNLOCKED` + emisión de código | `reward-goal-issuer.service.ts` |
| 9 | Cliente | Muestra el QR de canje en el mostrador — el código es la URL | `/redeem/{código}` |
| 10 | Empleado | Lo escanea con la cámara del teléfono y confirma. Consumo atómico, un solo uso | `redemption.service.ts` |
| 11 | Sistema | El canje cuenta como visita confirmada y cierra la meta como `REDEEMED` | `visits.repository.ts` |
| 12 | Sistema | Tras un enfriamiento (default 3 días), la próxima visita puede crear otra tarjeta | `reward-goal-engine.service.ts` |
| 13 | **Sistema** | **Si deja de venir → Retención lo detecta**, elige un mensaje, lo manda y mide si volvió | `retention-v2/*` |
| 14 | Cliente | Vuelve por el mensaje → nueva visita → el loop reinicia | `RetentionOutcome.returned` |

### Rol de cada pieza

- **QR / NFC** — la puerta de entrada. Identifica al negocio y al punto físico, nunca al cliente.
- **Visit** — la unidad de verdad. Todo lo demás se calcula desde acá.
- **Check-in** — el gesto que crea la `Visit` y devuelve la pantalla personal.
- **Feedback** — opinión interna. Da un sello extra y alimenta "comentarios para atender".
- **Reseña de Google** — externa y opcional. Flikker la pide y la lee, pero no la controla.
- **Sellos** — la representación visible del progreso. Vienen de visitas y de feedback.
- **Reward Goal** — la promesa concreta: "N sellos → X".
- **Beneficio** — el catálogo del dueño. Puede mostrarse en el check-in y/o autorizarse como recompensa.
- **Canje** — el cierre del ciclo, y la única tarea del empleado.
- **Mi Flikker** — la vista del cliente de todos sus locales en un lugar.
- **Retención** — el motor que actúa cuando el loop se rompe.

---

## Recurrencia por incentivo

> "Seguí viniendo y ganás algo."

Es la mitad **visible** del producto. El cliente sabe que existe, la ve en cada visita y
actúa en consecuencia.

### Qué genera un sello

- **Una visita real** — cada `Visit` posterior a `activatedAt` de la meta. Con dedup: si
  escanea tres veces seguidas, cuenta una.
- **Completar el feedback** — exactamente 1 sello extra, una sola vez por visita, vía
  `RewardGoalBonusStamp`. Configurable y **apagado por defecto**.

El progreso total es la suma: `Visit.count() + RewardGoalBonusStamp.count()`. El bonus
**nunca** crea una `Visit` falsa — es una tabla aparte, deliberadamente, para no contaminar
las métricas de visitas ni de retención.

### Cómo se evita duplicar progreso

- Dedup de visitas por horas/día en `visits.repository.ts`.
- `CheckinFeedback.visitId` único: una visita, un feedback, para siempre.
- `RewardGoalBonusStamp.feedbackId` único: un feedback, un sello, incluso bajo carrera.
- El unlock es una transición guardada (`updateMany where status = ACTIVE`): dos check-ins
  simultáneos no pueden desbloquear dos veces.

### Qué pasa después del canje

La meta pasa a `REDEEMED`. Empieza un cooldown (`rewardGoalCooldownDays`, default 3 días)
durante el cual no se crea una meta nueva. Pasado eso, la siguiente visita puede iniciar otra
tarjeta. Nunca se crea y desbloquea una meta en la misma visita — la recompensa siempre se
gana contra un compromiso previo.

### Configuración necesaria

`experienceVersion = CHECKIN_V2`, `rewardGoalsEnabled = true`, al menos un beneficio
autorizado como recompensa, y —si se quiere un "cada 5 sellos" parejo— fijar el número.
**Todo eso está apagado de fábrica.**

---

## Recurrencia por reactivación

> "Este cliente venía y dejó de aparecer; intentemos hacerlo volver."

Es la otra mitad, **invisible** para el cliente: solo recibe un WhatsApp que parece escrito
por el local.

- **Qué observa:** el historial de `Visit`. Clasifica en segmento — `NEW`, `REPEAT`,
  `FREQUENT`, `AT_RISK`, `INACTIVE`, `RECOVERED` — comparando el ritmo habitual del cliente
  contra cuánto hace que no viene (`resolve-customer-segment.ts`, `eligibility.ts`).
- **Qué puede hacer:** mandar un WhatsApp, con o sin incentivo. Si lleva incentivo, emite un
  `BenefitParticipation` con código y vencimiento. Solo usa beneficios explícitamente
  autorizados por el dueño.
- **Cómo mide si funcionó:** deja parte de los clientes detectados **sin contactar** (grupo
  de control) y compara cuántos volvieron de cada lado (`retention-outcome.service.ts`,
  `experiment-metrics.ts`). Sin ese control, "volvieron 12" no significaría nada.

### Relación entre las dos recurrencias

**Son independientes y cualquiera puede funcionar sola.** Cada una tiene su interruptor:
`rewardGoalsEnabled` y `retentionEngineV2Enabled`. Comparten el catálogo de incentivos
autorizados (`RetentionIncentiveDefinition`), la tabla de configuración (`RetentionSettings`)
y el clasificador de segmentos.

Se reparten el terreno: **incentivo actúa mientras el cliente todavía viene; reactivación
actúa cuando ya dejó.** De hecho `AT_RISK` e `INACTIVE` están explícitamente excluidos de
recibir metas nuevas (`reward-goal-rules.ts`) — a esos los agarra el otro motor.

---

## Experiencia del cliente

- **Primera visita** — Escanea → pantalla del local con su logo y color → formulario de
  nombre, teléfono y cumpleaños opcional → queda registrado. Recibe WhatsApp de bienvenida,
  ve el beneficio activo si hay uno, y aparece "¿Cómo fue tu experiencia?". Una hora después
  le llega un WhatsApp pidiéndole reseña.
- **Segunda visita** — Escanea → lo reconoce sin pedir nada → "¡Hola, Ana! Tu visita quedó
  guardada" → ve su contador y, si el motor le creó una meta, sus primeros sellos.
- **Visitas siguientes** — Idéntico, con la barra avanzando. Si escanea dos veces el mismo
  día: "Tu visita de hoy ya estaba guardada" — honesto, no suma.
- **Desbloqueo y canje** — "🎉 ¡Recompensa desbloqueada!". El código queda en Mi Flikker.
  Muestra el QR, el empleado lo escanea, confirma.
- **Mi Flikker** — Verifica su teléfono por OTP y ve todos los locales donde tiene actividad,
  sus visitas, su progreso y sus recompensas disponibles.
- **Si deja de venir** — Le llega un WhatsApp del local. Si vuelve y escanea, se registra
  como recuperado.

### Momentos confusos detectados

- **La meta aparece sin explicación.** El motor decide crear la tarjeta en algún momento
  posterior a la primera visita. Para el cliente, un día no hay sellos y al siguiente sí.
  Nadie le dijo que existía un programa.
- **Dos "premios" distintos conviven.** El beneficio del local (visible desde la primera
  visita) y la recompensa por sellos son cosas distintas con el mismo lenguaje visual.
- **Mi Flikker casi no se descubre.** Solo se llega desde un link al pie del check-in.
- **El cooldown es invisible.** Después de canjear, el cliente queda sin tarjeta unos días
  sin ninguna explicación.

---

## Experiencia del dueño

### Esencial

- `experienceVersion = CHECKIN_V2` — sin esto no existe check-in ni sellos. **Solo lo puede
  cambiar un operador de Flikker** (`PATCH /platform/businesses/:id/experience`).
- Al menos un `VisitSource` activo con su QR impreso y puesto físicamente en el mostrador.
- Un beneficio creado en **Beneficios**.
- `rewardGoalsEnabled` encendido y ese beneficio autorizado como recompensa.

### Opcional

Sellos necesarios (si no, el motor elige un número distinto por tipo de cliente); sello extra
por feedback; URL de Google para pedir reseñas; meta de reseñas o contactos para el panel;
retención encendida.

### Avanzado / interno — no debería ser un concepto de dueño

Modo observación (`dryRunEnabled`), experimentos, variantes, allocation, `optimizationMode`,
ventanas de atribución, topes de presupuesto por mes, cooldown de metas, capacidad prometida
por incentivo.

### Onboarding mínimo ideal — con lo que ya existe

1. Flikker crea el negocio y lo pone en `CHECKIN_V2`.
2. Genera el QR principal y se lo entrega impreso o listo para imprimir.
3. El dueño entra a **Beneficios** y escribe uno solo: "Cappuccino gratis".
4. Tilda "usar como recompensa" y pone "5 sellos".
5. Listo: el QR ya funciona y ya hay una promesa.

Retención, reseñas, campañas y widgets se activan después, cuando ya hay visitas. Hoy ese
camino existe pero está repartido entre el panel de plataforma y dos pantallas del dueño, sin
un hilo que lo guíe.

---

## Experiencia del empleado

Una tarea, cinco segundos, cero entrenamiento. El empleado tiene **exactamente una**
responsabilidad: confirmar canjes. No carga visitas, no registra clientes, no toca el panel.

1. El cliente muestra su QR — es una URL: `/redeem/{código}`.
2. El empleado abre la **cámara nativa** del teléfono (no hay cámara dentro de Flikker; se
   sacó a propósito).
3. Cae en la pantalla de validación: beneficio + nombre del cliente. Si no tiene sesión,
   login y vuelve exactamente al mismo canje.
4. Toca "Confirmar canje". Consumo atómico; un segundo intento nunca canjea dos veces.

### Permisos y sesión

- Requiere membresía activa con rol `OWNER`, `ADMIN` u `OPERATOR` **en el negocio dueño del
  código** — se resuelve desde el propio código, no desde el "negocio activo" de la sesión.
- Sesión pensada para dispositivo compartido de mostrador: access token corto + refresh de
  larga duración con rotación, revocable.
- Rate limiting en `preview` y `redeem` contra fuerza bruta de códigos.
- Sin membresía, un código ajeno devuelve el mismo 404 que un código inexistente.
- **Fallback:** entrada manual de código en Beneficios (`redeem-validator.tsx`).

**Carga operativa real:** prácticamente nula. El costo está en el *cliente*, que tiene que
sacar el teléfono en cada visita — ahí está el riesgo de adopción, no en el mostrador.

---

## Reseñas y feedback

Son dos sistemas distintos y conviene no confundirlos nunca.

| | Feedback interno | Reseña de Google |
|---|---|---|
| **Qué es** | Opinión privada para el negocio | Reseña pública en Google Maps |
| **Cuándo** | En el check-in, justo después de la visita | Ofrecida tras el feedback si puntuó 4+, o por WhatsApp 1 h después de registrarse |
| **Qué guarda** | `CheckinFeedback`: puntaje, comentario, visita | `GoogleReview`: leída por scraping, no escrita por Flikker |
| **Da sello** | **Sí** — +1, sin importar el puntaje | **Nunca** |
| **Control** | Total | Ninguno — Flikker solo la pide y después la detecta |

**Decisión de producto deliberada:** el sello se otorga por *dar la opinión*, nunca por
publicarla. Da igual si puso 1 o 5 estrellas, o si abrió Google. Eso evita comprar reseñas
positivas — que además de sucio viola las políticas de Google. La oferta de Google solo
aparece con 4+ estrellas: a un cliente disconforme se lo deriva al dueño, no a la vidriera
pública.

**Cómo llegan las reseñas:** un worker diario las scrapea vía Scrape.do y las guarda. Intenta
atribuirlas a un mensaje enviado dentro de una ventana de 7 días. La atribución es **débil
por naturaleza** — el propio código lo dice: en Insights la métrica se llama "reseñas desde
Flikker" con el comentario explícito de que no debe presentarse como "generadas por Flikker".

**LEGACY vs CHECKIN_V2:** en LEGACY el feedback vive en su propia página (`/l/{slug}`),
anclado a un mensaje, sin sellos ni visitas. En CHECKIN_V2 está embebido en el check-in,
anclado a una visita, y otorga sello. Los dos coexisten con modelos distintos
(`FeedbackResponse` vs `CheckinFeedback`).

---

## Features core

Sin esto Flikker pierde su propuesta principal.

- **Check-in por QR/NFC** — `modules/checkin`, `modules/visit-sources`
- **Visitas y reconocimiento** — sesión persistente + dedup + recuperación por OTP
- **Sellos y recompensas** — `modules/reward-goals`
- **Beneficios** — `modules/benefits`
- **Canje** — `redemption.service.ts`, `/redeem/[token]`
- **Panel de resultados** — `modules/dashboard`

## Features complementarias

Dan valor pero no definen el producto.

- **Retención / reactivación** — alto valor potencial, sin validar en producción
- **Feedback post-visita** — opinión interna + sello extra + insumo de reseñas
- **Reseñas de Google** — lectura, listado y respuesta
- **Mi Flikker** — vista multi-local del cliente; diferenciador a futuro, hoy poco visible
- **Clientes** — listado, import CSV/XLSX, export
- **Campañas manuales** — mensajes puntuales a listas
- **Insights** — evolución, conversión, embudo del QR
- **Widgets** — prueba social embebible; hoy oculta al dueño

## Qué ocurre internamente

Necesario técnicamente, **no vendible**.

- Experimentos con grupo de control (sin él, "funcionó" no sería demostrable)
- Optimización de allocation (`retention-optimization.service.ts`)
- Log de decisiones (auditoría de por qué el motor hizo lo que hizo)
- Topes de presupuesto (impide regalar incentivos sin límite)
- Panel de plataforma (onboarding asistido + impersonación)
- Simulación / Test Lab

**Producto visible:** "Tenés 12 clientes en riesgo, contactamos 8, volvieron 3", más un
estado en castellano: *Flikker todavía está aprendiendo* / *Hay señal* / *Sin diferencia
clara*.

**Maquinaria interna:** segmentación por percentiles de ritmo de visita, elegibilidad con
ventanas de silencio y topes por período, asignación determinista a variantes con grupo de
control, emisión de incentivos bajo lock de presupuesto mensual, medición de outcome con
ventana de atribución, corrección de Holm para comparaciones múltiples, y reasignación
automática de tráfico entre variantes con pisos de exploración.

> **Regla de posicionamiento:** nada de ese último párrafo debería aparecer nunca en una
> pantalla de dueño, en un pitch o en una landing. No porque sea vergonzoso —es lo que hace
> creíble al número— sino porque **un dueño de café que ve "p-value" y "allocation" concluye
> que el producto no es para él.**

## Features legacy

Solo compatibilidad: QR de captación V1 (`/qr/[businessId]`, `modules/qr-codes`); secuencia
de retención V1; landing de feedback V1 (`/l/[slug]`); atención de clínica
(`quick-attend.tsx`); reviews manuales (`Review`/`Response`/`ReviewTag`).

## Features experimentales / inmaduras

Capa de IA (opt-in, apagada, con validador determinista encima); integraciones Shopify y
Google Calendar (construidas, sin rol claro en el producto de café); sorteos (`RaffleDraw`,
poco explotado); planes y suscripciones (solo lectura; el plan lo asigna un operador a mano).

---

## Legacy vs producto actual

Todo se decide con `Business.experienceVersion`, que **por defecto es `LEGACY`**. Un negocio
nuevo arranca en el producto viejo hasta que un operador de Flikker lo mueve.

| | LEGACY | CHECKIN_V2 |
|---|---|---|
| **Promesa** | Conseguir más reseñas de Google | Hacer que los clientes vuelvan |
| **QR** | Captación de contacto, una vez | Check-in repetido, cada visita |
| **Dato central** | `Customer` + `ScanEvent` | `Visit` |
| **Recurrencia** | Secuencia de mensajes por días | Sellos + motor de retención con control |
| **Feedback** | Landing aparte por mensaje | Embebido en el check-in, con sello |
| **Vertical original** | Clínicas y salud | Gastronomía y retail de barrio |

**El futuro es `CHECKIN_V2`, sin ambigüedad.** El motor legacy está explícitamente excluido
para negocios V2 (`retention.processor.ts` filtra por `experienceVersion`).

### Dónde las dos experiencias todavía se mezclan

- **El onboarding pide una vertical de salud** — dental, estética, fisio, médico, nutrición,
  gimnasio. No hay "cafetería": un negocio gastronómico tiene que elegir "Otro".
- **La pantalla de Retención legacy sigue existiendo** y muestra "Esta pantalla se movió" a
  los negocios V2 — correcto, pero es deuda visible.
- **Campañas mezcla los dos mundos:** "QR Captación" es el flujo legacy, conviviendo con el
  QR de check-in que vive en otra pantalla.
- **Beneficios no distingue experiencia:** el mismo listado se le muestra a un negocio LEGACY,
  donde la mitad de los conceptos no aplica.

---

## Qué NO es Flikker

| No es… | Por qué |
|---|---|
| **Tarjeta de fidelización digital** | Los sellos son la *interfaz*, no el producto. Una tarjeta digital no detecta que dejaste de venir ni te escribe. |
| **Software de puntos** | No hay puntos, ni saldo, ni conversión. Hay una promesa concreta con un final: N sellos → esta cosa. |
| **Plataforma de descuentos** | El descuento es opcional y lo define el negocio. No hay catálogo, ni marketplace, ni negociación de precios. |
| **CRM** | No hay pipeline, ni oportunidades, ni gestión de relaciones. Hay una lista de clientes con visitas. |
| **Plataforma de WhatsApp** | WhatsApp es un caño de salida, no el producto. Nadie compra Flikker para mandar mensajes. |
| **Software de reseñas** | Lo era. Hoy las reseñas son una consecuencia del check-in, no la razón de compra. |
| **Herramienta de IA** | La IA está apagada por defecto y solo redacta copy, con validador determinista encima. Ninguna decisión comercial la toma un modelo. |
| **Herramienta de analytics** | Mide, pero para *actuar*. Un dashboard que no dispara un sello ni un mensaje no sería Flikker. |

**Qué une todo:** Flikker es la única pieza que **convierte una visita anónima en una relación
medible, y esa relación en una acción automática**. El QR captura, el sello retiene, el
mensaje recupera y el panel demuestra. Sacale cualquiera de las cuatro y lo que queda es un
producto que ya existe en el mercado.

---

## Cómo venderlo y demostrarlo

Demo de tres minutos, en el orden exacto:

| Tiempo | Qué hacer |
|---|---|
| **0:00** | Nada de pantallas. Una pregunta: "¿Cuántos de los que entraron hoy ya habían venido antes?" Dejalo contestar. No sabe. |
| **0:20** | **Sacá el QR físico y ponelo sobre la mesa.** Que él lo escanee con su propio teléfono. Objeto real, no captura. |
| **0:40** | Que se registre en su teléfono. Nombre y teléfono. Diez segundos. Se ve lo poco que cuesta. |
| **1:00** | Mostrá los sellos en **su** pantalla: "Te faltan 4 sellos para tu cappuccino gratis". |
| **1:20** | Que escanee otra vez y vea el sello sumarse. Ese es el momento en que se entiende el producto. |
| **1:50** | **Recompensa desbloqueada → canje.** Que muestre su QR y escanealo vos. Confirmado. El loop cerró frente a él. |
| **2:30** | Recién ahora, el panel: clientes activos, check-ins, recompensas canjeadas. "Esto es lo que vos ves." |
| **2:50** | Retención en una sola frase: "Y al que deja de venir, le escribimos solos." No abras la pantalla. |

### Qué NO mostrar nunca en una primera demo

- Retención avanzada: experimentos, variantes, uplift, allocation, modo observación.
- El panel de plataforma o la impersonación — revela que el producto no es autoservicio.
- Configuración de Retención V2 completa: son más de veinte campos.
- Insights antes de que exista el "ajá" del sello.
- Widgets, integraciones, Test Lab, planes.
- Cualquier pantalla sin datos: un panel vacío mata la demo.

---

## Métrica principal

### North Star candidata

**Visitas de clientes recurrentes por semana y por negocio** — `Visit` con `isReturn = true`.

Es la única que sube solo si el producto está cumpliendo su promesa: alguien volvió *y*
escaneó. Captura las dos mitades a la vez (el sello lo trajo, o el mensaje lo trajo), no se
puede inflar sin valor real, y es exactamente lo que el dueño compraría si se lo pudiera
comprar directo.

| Familia | Métrica | Por qué |
|---|---|---|
| **Negocio** | Clientes activos en el período · tasa de retorno · recompensas canjeadas | Canjeadas > desbloqueadas: el canje prueba que volvió al local. |
| **Cliente** | Metas completadas · sellos por cliente · % que llega a canjear | Si se desbloquean muchas y se canjean pocas, la recompensa no motiva. |
| **Operativa** | Check-ins por fuente QR · % de visitas duplicadas · tasa de feedback | Detectan QR mal ubicado o dedup mal calibrado. |
| **Retención** | Recuperados **contra el grupo de control** | Sin control no es una métrica, es una anécdota. |

### Vanity metrics — no usarlas para vender

- **Escaneos QR.** En V2 el contador `VisitSource.scannedCount` es acumulado y *sin historial
  por fecha*: no se puede medir por período. Además incluye escaneos que no dejaron nada.
- **Total de reseñas.** Flikker no las genera ni puede probar que las causó.
- **Recompensas desbloqueadas.** Se desbloquean solas al llegar al número. Sin canje, no
  prueban nada.
- **Contactos totales.** Es un número de captación, no de recurrencia.

---

## Estado actual del producto

| Loop | Estado | Por qué |
|---|---|---|
| **Check-in** | ✅ READY | Flujo completo: landing, registro, sesión persistente, dedup, recuperación por OTP, eventos. `checkin.service.ts` |
| **Sellos** | ✅ READY | Progreso, bonus aditivo, unlock atómico, cooldown, expiración. Cubierto por tests unitarios e integración real. |
| **Recompensas** | ✅ READY | Emisión con código y vencimiento, topes de capacidad, barrido de expirados. |
| **Canje** | ✅ READY | Flujo por URL, cámara nativa, auth por membresía desde el código, rate limiting, fallback manual. |
| **Operación del empleado** | ✅ READY | Una sola tarea, sesión larga para dispositivo compartido, retorno al canje tras login. |
| **Dashboard** | ✅ READY | Endpoint agregado único con período 7/30/90 y comparación. `modules/dashboard` |
| **Reseñas** | 🟡 PARCIAL | Ingesta diaria y listado sólidos; la **atribución es débil** (ventana de 7 días) y el propio código evita afirmar causalidad. |
| **Mi Flikker** | 🟡 PARCIAL | Funciona (OTP, multi-local, progreso, código de canje) pero es casi indescubrible. |
| **Medición** | 🟡 PARCIAL | Buena en visitas y recompensas; **ciega en escaneos por período** para V2. |
| **Reactivación** | 🟡 PARCIAL | Motor completo y testeado, pero arranca apagado, con modo observación, y **nunca corrió en un negocio real el tiempo suficiente para probar que funciona**. |
| **Onboarding del dueño** | ⬜ LEGACY | El wizard existente es de la etapa clínica. No configura nada de V2. |
| **Autoservicio** | ❌ NO IMPLEMENTADO | Un dueño no puede crear su QR (`impersonatorOnly`), ni pasar su negocio a V2, ni contratar un plan. |

---

## Principales inconsistencias

Ordenadas por impacto en el producto, no por esfuerzo de arreglo.

1. **El dueño no puede acceder a su propio QR** — *Alto.* QR y Widget están marcados
   `impersonatorOnly` en el sidebar. El objeto central del producto es invisible para quien
   lo compra. Si se pierde el sticker, no puede reimprimirlo sin llamar a Flikker.
2. **Nada funciona recién instalado** — *Alto.* `experienceVersion` arranca en `LEGACY`;
   `rewardGoalsEnabled`, `retentionEngineV2Enabled` y el sello por feedback arrancan en
   `false`. Cuatro interruptores en tres pantallas distintas.
3. **El onboarding pertenece a otro producto** — *Alto.* Verticales de salud únicamente. Una
   cafetería tiene que elegir "Otro". El wizard configura plantillas de clínica y no menciona
   check-in, sellos ni beneficios.
4. **Dos "premios" compiten en la misma pantalla** — *Medio.* El beneficio activo del local y
   la recompensa por sellos son mecánicas distintas con el mismo lenguaje visual.
5. **"Activo" significa dos cosas en Beneficios** — *Medio.* Un beneficio puede estar *activo*
   (se muestra en el check-in) y/o *autorizado* (el motor puede usarlo). La pantalla necesita
   un párrafo entero para explicarlo — señal de que el modelo, no el copy, es lo confuso.
6. **El objetivo de sellos puede variar por cliente sin que el dueño lo sepa** — *Medio.* Si
   no fija el número, el motor elige un target por segmento (1 nuevos, 2 recurrentes, 3–5
   frecuentes). Dos clientes en la misma mesa pueden ver metas distintas.
7. **Dos sistemas de feedback conviven** — *Medio.* `FeedbackResponse` (legacy, por mensaje) y
   `CheckinFeedback` (nuevo, por visita, con sello). Mismo nombre de cara al usuario.
8. **Escaneos QR no es medible por período en V2** — *Medio.* `VisitSource.scannedCount` es
   acumulado sin historial. El embudo de captación real es inobservable en la experiencia
   nueva.
9. **Funciones construidas y escondidas** — *Bajo.* Test Lab existe como ruta pero no está en
   el menú. Widgets oculto al dueño. Sorteos casi no expuesto. Integraciones Shopify y Google
   Calendar sin rol en el producto actual.
10. **Restos de la etapa clínica en el panel** — *Bajo.* `quick-attend.tsx` ("marcar
    atendido") sigue apareciendo para verticales de salud, junto a la Retención legacy que
    solo dice que se mudó.

---

## Definición de Flikker en una sola frase

> **Flikker le da a tus clientes una razón para volver — y sale a buscarlos cuando dejan de
> venir.**
