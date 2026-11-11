"use client";

import { useEffect, useState } from "react";
import SectionCard from "@/components/ui/section-card";

export interface ConsentAuditView {
  customers: { active: number; withPhone: number; withEmail: number; linkedToMiFlikker: number };
  whatsapp: {
    granted: number;
    grantedBySource: Record<string, number>;
    revoked: number;
    suppressed: number;
    neverAsked: number;
    neverAskedVisitedLast30d: number;
    neverAskedWithMiFlikker: number;
    noPhone: number;
  };
  email: { granted: number; revoked: number; neverAsked: number; noEmail: number };
  notes: string[];
}

const SOURCE_LABELS: Record<string, string> = {
  CHECKIN_FORM: "en el check-in",
  MI_FLIKKER: "desde Mi Flikker",
  STAFF: "cargados por el local",
  LEGACY_IMPORT: "importados con prueba",
  PLATFORM: "cargados por Flikker",
};

/** Las líneas de la tarjeta: cuántos, por qué el resto no y cómo sumar más. */
export function consentAuditLines(a: ConsentAuditView): {
  headline: string;
  reasons: string[];
  next: string[];
} {
  const sources = Object.entries(a.whatsapp.grantedBySource)
    .filter(([, n]) => n > 0)
    .map(([source, n]) => `${n} ${SOURCE_LABELS[source] ?? source}`);
  const headline =
    a.customers.active === 0
      ? "Todavía no hay clientes."
      : `${a.whatsapp.granted} de ${a.customers.active} clientes autorizaron recibir promociones por WhatsApp${
          sources.length ? ` (${sources.join(", ")})` : ""
        }.`;
  const reasons: string[] = [];
  if (a.whatsapp.neverAsked) reasons.push(`${a.whatsapp.neverAsked} todavía no respondieron.`);
  if (a.whatsapp.revoked) reasons.push(`${a.whatsapp.revoked} dijeron que no o se dieron de baja.`);
  if (a.whatsapp.suppressed) reasons.push(`${a.whatsapp.suppressed} pidieron no ser contactados.`);
  if (a.whatsapp.noPhone) reasons.push(`${a.whatsapp.noPhone} no tienen teléfono.`);
  const next: string[] = [];
  if (a.whatsapp.neverAskedVisitedLast30d) {
    next.push(
      `${a.whatsapp.neverAskedVisitedLast30d} de los que no respondieron vinieron en los últimos 30 días: en su próximo check-in se les ofrece la casilla.`,
    );
  }
  if (a.whatsapp.neverAsked) {
    next.push("Invitá en el mostrador a escanear el QR: la casilla es opcional y viene desmarcada.");
  }
  return { headline, reasons, next };
}

/**
 * Configuración → Políticas → Autorizaciones. A cuántos clientes se les
 * pueden mandar promociones y por qué al resto no. Todos los clientes siguen
 * en Flikker con sus visitas y premios, autoricen o no.
 */
export default function ConsentAuditCard() {
  const [audit, setAudit] = useState<ConsentAuditView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/proxy/policy/consent-audit")
      .then((res) => (res.ok ? (res.json() as Promise<ConsentAuditView>) : null))
      .then((data) => {
        if (!cancelled) setAudit(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Sin permiso (operador) o sin datos: no se muestra.
  if (!audit) return null;
  const { headline, reasons, next } = consentAuditLines(audit);

  return (
    <SectionCard
      title="Autorizaciones de tus clientes"
      description="Tener teléfono o haber hecho check-in no es una autorización: solo cuenta un sí explícito."
    >
      <p className="text-sm font-semibold text-[color:var(--panel-text)]">{headline}</p>
      {reasons.length ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-[color:var(--panel-text-secondary)]">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {next.length ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-[color:var(--panel-text-muted)]">Cómo sumar más</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[color:var(--panel-text-secondary)]">
            {next.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-[color:var(--panel-text-muted)]">
        Email: {audit.email.granted} autorizaron, {audit.email.neverAsked} con email todavía no respondieron.
      </p>
    </SectionCard>
  );
}
