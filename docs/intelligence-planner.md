# Intelligence: planificador comercial con IA

Estado al 2026-11-11: **solo simulación**. El planificador piensa, propone y
elige planes, pero no recluta ni envía nada. No está desplegado.

## Qué hace

Una corrida sigue este ciclo:

1. **Observar.** El modelo recibe las métricas verificables del negocio, el
   catálogo de incentivos autorizado, los topes de la política y su historial
   de planes.
2. **Analizar y formular hipótesis**, citando métricas.
3. **Diseñar.** Arma segmentos con cualquier combinación de rasgos (no hay
   una lista cerrada de campañas), escribe mensajes propios y elige
   incentivos solo del catálogo.
4. **Evaluar.** Prueba segmentos con `preview_segment`, que devuelve solo
   conteos: cuántos entran y cuántos se pueden contactar.
5. **Decidir.** Elige hasta 3 planes, o decide no actuar y explica por qué.
6. **Validar (servidor).** Revisa cada plan contra el contrato
   `CommercialPlan` y devuelve los problemas para que el modelo corrija, hasta
   2 veces.
7. **Simular (servidor).** Calcula alcance real, grupo de control, reparto por
   variante y costo, y lo registra.

Medir y aprender son las fases siguientes (ver Pendientes).

## Lo que decide la IA y lo que decide el servidor

**La IA decide:**
- qué mirar;
- qué hipótesis formular;
- qué segmentos armar;
- qué mensajes escribir y en qué tono;
- qué incentivo del catálogo usar;
- cuántas variantes comparar;
- qué plan elegir, o no actuar.

**El servidor decide, de forma determinística:**
- Si cada número citado sale de los datos. Si no, el plan se rechaza; si el
  número está en el resumen, el resumen se reemplaza por uno verificable.
- Si el incentivo está autorizado y tiene costo.
- Si el mensaje promete algo que el incentivo no tiene.
- A quién se puede contactar: consentimiento de WhatsApp, siempre.
- Que dos planes no compartan clientes.
- Presupuesto, tope semanal y muestra mínima de 5.
- Grupo de control obligatorio.
- No repetir un plan simulado en los últimos 7 días.
- Topes de uso de la IA.

## Cómo se activa (local o staging)

| Qué | Dónde |
|---|---|
| IA global | `AI_ENABLED=true`, `OPENAI_API_KEY` |
| Modelo del planificador | `AI_PLANNER_MODEL` (por defecto `AI_MODEL`) |
| Precios para el costo | `AI_PLANNER_PRICE_INPUT_PER_MILLION_USD`, `AI_PLANNER_PRICE_OUTPUT_PER_MILLION_USD` |
| Topes por negocio | `AI_PLANNER_MAX_RUNS_PER_DAY` (3), `AI_PLANNER_MONTHLY_USD_CAP` (USD 2) |
| Negocio | `RetentionSettings.aiInsightsEnabled = true` |
| Corrida diaria con IA | Platform: `PATCH /platform/businesses/:id/autonomy` con `{ "mode": "DRY_RUN", "plannerEnabled": true }` |
| Corrida a pedido | Dueño o admin: `POST /intelligence/autonomy/planner/run` |
| Ver resultados | `GET /intelligence/autonomy/runs/:id` (análisis, traza y planes) |

Con el planificador prendido, la corrida diaria es suya **aunque el negocio
esté en PILOT**: queda en simulación y las reglas fijas no reclutan.

## Comparación de modelos

**Negocio sintético** en la base local: 105 clientes con perfiles variados y
45 % con WhatsApp autorizado. **No son datos reales.** Precios de lista
pública conocidos, a verificar antes de configurar producción.

| Modelo | Resultado | Correcciones | Costo por corrida | Calidad observada |
|---|---|---|---|---|
| gpt-4o-mini | 2 planes simulados | 1 | US$ 0,006 | Segmentos redundantes; control de 10 % en grupos de 11 (1 persona) |
| gpt-4.1 | 1 plan simulado | 1 | US$ 0,069 | Prudente: habituales demorados sin descuento |
| gpt-5-mini | 2 planes simulados | 0–1 | US$ 0,015–0,026 | Mejor estructura: hipótesis claras y cada incentivo comparado contra una variante sin incentivo |

**Proyección mensual por negocio (una corrida diaria):**
- gpt-4o-mini: unos US$ 0,2;
- gpt-5-mini: unos US$ 0,5–0,8;
- gpt-4.1: unos US$ 2, en el tope por defecto.

**Recomendación:** `AI_PLANNER_MODEL=gpt-5-mini` con sus precios cargados. Es
lento (1 a 2 minutos por corrida), lo que no afecta a una corrida diaria en
segundo plano.

Lecciones de la prueba que ya están corregidas en el código:
- un modelo que solo explora ahora está obligado a entregar en las últimas
  rondas;
- el resumen con claves técnicas se reescribe;
- el prompt pide comparar cada incentivo contra una variante sin incentivo.

## Pendientes antes de ejecutar de verdad

1. **Ejecución.** Convertir un plan simulado en un experimento de Autopilot
   con textos por variante, que envíe por `MessagingService`. Requiere
   autorización explícita y piloto.
2. **Medición por plan.** Separar correlación, atribución (vuelta por link o
   canje del mensaje) e incrementalidad contra el control, con etiquetas de
   "sin evidencia" en muestras chicas.
3. **Aprendizaje.** Pasar esos resultados a `plan_history`, que hoy devuelve
   planes sin resultados.
4. **Pantallas.** Actividad autónoma y chat: mostrar observaciones,
   hipótesis, planes considerados y descartados con su motivo. La API ya los
   devuelve.
5. **Mensajería.** Pasar Promociones (`campaigns.service`) por
   `MessagingService`, escuchar el evento `session.status` de WaSender y
   resolver el remitente por negocio.
