import ProUpgradePrompt from "@/components/panel/pro-upgrade-prompt";
import { isAtPlanLimit, type FreePlanUsage } from "@/lib/free-plan-usage";

/**
 * "Tu plan llegó al límite" en Insights — una señal de CAPACIDAD, no una
 * métrica de performance.
 *
 * La distinción es el punto entero de este componente. El resto de Insights
 * mide cómo le va al negocio; esto mide un techo que le puso Flikker. Si
 * apareciera entre los KPIs, un dueño leería "bajaron mis altas de
 * clientes" y buscaría la causa en su local, cuando la causa es el plan.
 * Por eso vive suelto, con su propio encabezado, y el copy dice
 * explícitamente que no pudieron COMPLETAR EL ALTA.
 *
 * Solo se renderiza con evidencia real: el negocio en el tope Y al menos
 * una persona efectivamente bloqueada esta semana. Sin bloqueos medidos no
 * hay nada que reportar acá — el aviso de "los próximos no van a poder"
 * es trabajo de Inicio, no de una pantalla de análisis.
 *
 * `usage` llega en `null` para Pro y para negocios sin tope, así que al
 * actualizar el plan esto desaparece sin ninguna lógica extra.
 */
export default function PlanLimitSignal({
  usage,
}: {
  usage: FreePlanUsage | null;
}) {
  if (!usage || !isAtPlanLimit(usage)) return null;

  const blocked = usage.blockedCustomersLast7Days;
  if (blocked <= 0) return null;

  return (
    <section aria-label="Capacidad del plan" className="space-y-3">
      <div>
        <h2 className="font-display text-base font-bold text-[color:var(--panel-text-primary)]">
          Tu plan llegó al límite
        </h2>
        <p className="mt-1 text-sm leading-6 text-[color:var(--panel-text-secondary)]">
          Esto no es una caída de tu actividad: es la capacidad del plan
          Gratis.
        </p>
      </div>

      <ProUpgradePrompt
        feature="customer_limit"
        variant="card"
        title="Seguí sumando clientes"
        description="Tu plan Gratis alcanzó su capacidad. Con Pro podés seguir incorporando clientes y acceder a las funciones adicionales de tu plan."
        evidence={
          blocked === 1
            ? `Esta semana 1 cliente nuevo no pudo completar el alta. Estás en ${usage.current} de ${usage.limit}.`
            : `Esta semana ${blocked} clientes nuevos no pudieron completar el alta. Estás en ${usage.current} de ${usage.limit}.`
        }
        /*
          Los tres son entitlements REALES auditados del plan Pro, no
          promesas: `maxCustomers: null`, Beneficios sin vencimiento de
          trial (`isBenefitsBlocked` siempre false para Pro) y la
          automatización de Cumpleaños (`hasProAccess` en
          `updateAutomations`).
        */
        benefits={[
          "Sumar clientes sin tope.",
          "Usar Beneficios sin que se venza la prueba de 30 días.",
          "Activar el saludo automático de cumpleaños.",
        ]}
        cta="Ampliar capacidad"
      />
    </section>
  );
}
