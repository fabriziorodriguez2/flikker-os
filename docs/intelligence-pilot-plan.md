# Flikker Intelligence: plan de piloto controlado

**Negocio:** el de unos 105 clientes. **No hubo acceso autorizado a sus datos
reales en esta preparación**, así que este plan no contiene ninguna cifra
suya: las líneas de base se toman en el paso 1, con permiso explícito y solo
lectura.

## 1. Línea de base (con autorización, solo SELECT)

Antes de prender nada, con permiso del dueño y de Flikker, correr en
producción en modo de solo lectura (reemplazar `:biz`):

```sql
-- Clientes y contactabilidad
SELECT count(*) FILTER (WHERE "isActive") AS activos,
       count(*) FILTER (WHERE "isActive" AND NOT opted_out) AS sin_baja
FROM "Customer" WHERE "businessId" = :biz;

-- Consentimiento explícito de WhatsApp (se espera 0 antes del piloto)
SELECT count(DISTINCT customer_id) FROM customer_consent_events
WHERE business_id = :biz AND channel = 'WHATSAPP' AND action = 'GRANTED';

-- Visitas de los últimos 90 días y clientes que volvieron
SELECT count(*) AS visitas,
       count(DISTINCT customer_id) AS clientes,
       count(*) FILTER (WHERE is_return) AS retornos
FROM visits WHERE business_id = :biz AND occurred_at >= now() - interval '90 days';

-- Autopilot hoy (para confirmar el bug de horario y su arreglo)
SELECT status, count(*) FROM retention_assignments
WHERE business_id = :biz GROUP BY status;
```

Se anotan los resultados tal cual, con la fecha. Son la comparación de los
días 7 y 30.

## 2. Checklist de activación explícita

Cada paso lo marca una persona con nombre y fecha. Si uno falla, no se sigue.

1. [ ] Migraciones aplicadas y checklist de release (A–C) completos. Ver `docs/intelligence-release-audit.md`.
2. [ ] Platform Admin carga el **costo por mensaje** del negocio (Platform → negocio → Plan).
3. [ ] El dueño **acepta la política** en Configuración → Políticas, revisando los topes. El preset Equilibrado se puede editar.
4. [ ] Se activa la **casilla de consentimiento** en el check-in (ya viene en el formulario). Durante 1 a 2 semanas el local la invita a marcar en el mostrador. Meta mínima para arrancar: 20 clientes con WhatsApp autorizado.
5. [ ] Intelligence habilitado para el negocio (`aiInsightsEnabled`).
6. [ ] "Te extrañamos" activo en Notificaciones → Automáticas, para que existan los experimentos de Autopilot.
7. [ ] Modo autónomo en **Simulación** durante 3 a 7 días.
8. [ ] Revisión de la simulación **con el dueño** en Intelligence → Actividad autónoma. Hay que confirmar:
   - qué estrategia elige;
   - a cuántos clientes;
   - por qué descarta las demás;
   - que los conteos coinciden con lo que el dueño conoce.
9. [ ] **Aprobación explícita del dueño**, por escrito, de un piloto de **5 a 10 clientes por día** durante 30 días.
10. [ ] Platform Admin activa **Piloto** con "Confirmo el piloto" y "Clientes por día" en 5 a 10.

## 3. Criterios de éxito

Se fijan antes y se miden después, sin suponer resultados.

**Seguridad.** Obligatorios: uno solo que falle detiene el piloto.
- 0 mensajes a clientes sin consentimiento explícito. *Medición:* cruzar `retention_assignments` (SENT) del negocio contra `customer_consent_events`.
- 0 topes de la política excedidos (mensajería, incentivos, destinatarios por semana, campañas por semana).
- 0 envíos duplicados al mismo cliente por la misma corrida.
- 0 accesos o datos de otro negocio.
- El kill switch probado una vez en el día 1: pausar y reanudar.

**Operación.**
- Una corrida registrada por día en al menos el 95 % de los días, cada una con explicación.
- Menos del 10 % de respuestas del chat reemplazadas por el aviso de "no pude verificar". *Medición:* logs `Intelligence answer rejected`.
- Costo de IA dentro del escenario "activo" (menos de US$ 1 por mes). *Medición:* reporte de costos.

**Retención.** Exploratorio, y se dice así.
- Tasa de vuelta a 14 y 30 días de los contactados contra el grupo de control de Autopilot. Siempre con el tamaño de cada grupo.
- **Con unos 105 clientes y grupos de 5 a 10 por día, el piloto no tiene tamaño para afirmar causalidad.** Debajo de 30 por grupo, se informa como "señal, sin significancia", que es como ya lo marca Autopilot (INSUFFICIENT_DATA).
- Canjes atribuibles y bajas (respuestas "BAJA") por cada 100 contactados.

**Producto.**
- El dueño entiende cada corrida sin ayuda. Se valida con una entrevista corta al día 7 y al día 30.

## 4. Monitoreo

**Todos los días (5 minutos)**
- Intelligence → Actividad autónoma: estado de la corrida, enviados, bloqueos.
- Configuración → Políticas: uso del mes y si hubo pausa automática.

**Día 7**
- Revisar los criterios de seguridad completos (consultas del punto 1 más las corridas).
- Bajas y quejas: si hubo pausa automática, se analiza antes de reanudar.
- Reporte de costos de la semana.
- Decisión: seguir, achicar el grupo o volver a Simulación.

**Día 30**
- Retención contactados contra control, con tamaños de grupo.
- Costo total separado: IA, mensajería y recompensas.
- Entrevista con el dueño.
- Decisión documentada: ampliar a más negocios, extender el piloto o apagar.

## 5. Rollback

Ver `docs/intelligence-autonomy-rollout.md`, sección Rollback. En resumen:
- **Frenar todo ya:** "Pausar todo" en Políticas (dueño o admin).
- **Solo el modo autónomo:** "Apagar" en Actividad autónoma, o modo Apagado en Platform.
- **Volver a mirar:** modo Simulación.
- **Revertir el código:** las tablas y columnas son aditivas y pueden quedar.
