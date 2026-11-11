# Intelligence: modo autónomo, rollout y rollback

El modo autónomo detecta oportunidades todos los días y, en piloto, suma un
grupo chico de clientes a Autopilot (Retention V2). **No tiene camino de envío
propio:** el envío, el horario, los reintentos y la reserva de costo por mensaje
siguen siendo de Autopilot y del motor de políticas.

## Cómo funciona una corrida

1. **Cuándo corre:** dentro del job diario de evaluación de Autopilot
   (`RETENTION_V2_EVALUATE_CRON`, 09:00 por defecto). No hay un cron propio.
2. **Cuántas veces:** una corrida por negocio y día local, con
   `autonomous_runs (business_id, run_key)` como clave única.
   - Un doble cron o un reintento devuelve la corrida existente.
   - Una corrida que quedó `RUNNING` hace más de 30 minutos (caída) se retoma.
     Las asignaciones son únicas por experimento y cliente, así que retomar no
     duplica a nadie.
3. **Qué hace:** detectar → evaluar con el motor de políticas → elegir UNA
   estrategia → armar un grupo chico (como máximo `autonomy_pilot_group_size`,
   y más chico si el presupuesto o los topes no alcanzan) → registrar. En
   `PILOT`, además, crea asignaciones en el experimento de Autopilot, marcadas
   con la corrida.
4. **Con `PILOT` prendido, Autopilot deja de reclutar ese negocio.** Lo
   recluta solo el modo autónomo, para que no haya dos reclutadores.
5. **Cada corrida queda guardada**, también cuando no hace nada: estado,
   oportunidades, descartes con motivo, bloqueos, conteos reales, explicación y
   sugerencias. Se ve en Intelligence → Actividad autónoma, y el agente la lee
   con la herramienta `autonomy_activity`.

## Prerrequisitos para un piloto

- El negocio está en `CHECKIN_V2` con `retention_engine_v2_enabled = true`.
- Las migraciones están corridas: `20261109…`, `20261110…`, `20261111…`,
  `20261112090000_policy_engine` y `20261113090000_intelligence_autonomy`.
- El dueño aceptó la política (Configuración → Políticas).
- Platform Admin cargó el costo por mensaje.
- Las automatizaciones de Autopilot que se van a usar están activas, para que
  existan los experimentos: "Te extrañamos" y/o "Cerca del premio".
- Hay clientes con consentimiento de WhatsApp. Sin consentimiento no sale
  nada, y la corrida lo explica.

## Rollout, paso a paso

1. **Desplegar:** en Railway, correr `npm run start:release`
   (`prisma migrate deploy` + arranque). Todos los negocios quedan con
   `autonomy_mode = OFF` y sin cambios de comportamiento.
2. **Simulación:** en Platform → negocio → Plan, poner el modo autónomo en
   **Simulación**.
3. **Revisar la simulación:** dejarla correr 3 a 7 días y revisar con el dueño
   Intelligence → Actividad autónoma. Hay que mirar:
   - qué estrategia elige y a cuántos;
   - por qué descarta las demás;
   - si los conteos de consentimiento y de clientes coinciden con lo real;
   - que nunca aparezca un cliente sin consentimiento.
4. **Aprobación del dueño:** conseguirla explícitamente para un piloto acotado
   (sugerido: 5 a 10 clientes por día, una semana).
5. **Prender el piloto:** en Platform, elegir **Piloto**, marcar la
   confirmación y fijar "Clientes por día". El backend lo rechaza si falta la
   política, si está en pausa o si no hay costo por mensaje.
6. **Seguimiento diario:** revisar Actividad autónoma (enviados, volvieron,
   canjes, costo real) y Configuración → Políticas (uso del mes, pausas
   automáticas).
7. **Ampliar o volver:** según los resultados, subir "Clientes por día" o
   volver a Simulación.

## Rollback

Del más rápido al más amplio:

| Qué | Cómo | Efecto |
|---|---|---|
| Frenar todo ya | Configuración → Políticas → **Pausar todo** (dueño o admin) | No sale ningún mensaje gobernado, ni de Autopilot ni de promociones. Lo pendiente se descarta al despachar. |
| Apagar solo el modo autónomo | Intelligence → Actividad autónoma → **Apagar** (dueño o admin), o Platform → modo **Apagado** | Desde la próxima corrida no se recluta. Autopilot vuelve a reclutar por su cuenta con sus reglas. Lo ya reclutado sigue su curso en Autopilot (y la política lo sigue gobernando). |
| Volver a solo mirar | Platform → modo **Simulación** | Se siguen generando planes sin reclutar. |
| Cancelar lo ya reclutado | `UPDATE retention_assignments SET status='SKIPPED', skip_reason='MANUAL_ROLLBACK' WHERE autonomous_run_id = '<id>' AND status='PENDING';` (solo en la base correspondiente, con backup) | Esas asignaciones no se envían. |
| Revertir el código | Volver a desplegar el commit anterior. Las columnas y tablas nuevas son aditivas y pueden quedar. | Sin efecto sobre los datos existentes. |

## Qué no hace todavía

- **No envía por su cuenta.** Si Autopilot no tiene la estrategia, no se
  ejecuta: "Beneficio por vencer" y "Cohorte con descenso" se detectan y se
  explican, pero no se envían.
- **No cambia reglas globales:** ni experimentos, ni automatizaciones, ni
  topes.
- **Incentivos de catálogo:** solo variantes que el dueño ya autorizó, y solo
  después de dos pruebas sin descuento, con 5 o más clientes expuestos y
  ninguno que volvió.
