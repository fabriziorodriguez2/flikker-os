"use client";

import { useCallback, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import AdminStatusBadge from "@/components/admin/admin-status-badge";
import MetricCard from "@/components/ui/metric-card";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import { FEATURES } from "@/src/config/features";
import { useCanMutate } from "../../role-context";

interface Member {
  id: string;
  role: string;
  status: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

const ROLES = ["OWNER", "ADMIN", "OPERATOR", "VIEWER"];

export default function MembersPage() {
  if (!FEATURES.MULTI_USER) notFound();

  return <MembersContent />;
}

function MembersContent() {
  const canMutate = useCanMutate();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("OPERATOR");

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy/memberships");
      if (!res.ok) throw new Error("Error al cargar miembros");
      setMembers(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/proxy/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Error al agregar miembro");
      }
      setEmail("");
      setRole("OPERATOR");
      setShowForm(false);
      setMessage("Miembro agregado");
      await fetchMembers();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangeRole(membershipId: string, newRole: string) {
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/memberships/${membershipId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Error al cambiar rol");
      }
      setMessage("Rol actualizado");
      await fetchMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleRevoke(membershipId: string) {
    setMessage(null);
    if (!confirm("¿Revocar acceso a este miembro?")) return;

    try {
      const res = await fetch(`/api/proxy/memberships/${membershipId}/revoke`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Error al revocar");
      }
      setMessage("Miembro revocado");
      await fetchMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-4 w-28 animate-pulse rounded-full bg-[color:var(--surface-subtle)]" />
        <div className="h-12 w-80 animate-pulse rounded-[18px] bg-[color:var(--surface-muted)]" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-32 animate-pulse rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)]" />
          <div className="h-32 animate-pulse rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)]" />
          <div className="h-32 animate-pulse rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)]" />
        </div>
        <div className="h-80 animate-pulse rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)]" />
      </div>
    );
  }

  const activeMembers = members.filter(
    (member) => member.status === "ACTIVE",
  ).length;
  const admins = members.filter((member) =>
    ["OWNER", "ADMIN"].includes(member.role),
  ).length;

  const inputClass =
    "mt-2 w-full rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--text-soft)] focus:border-[color:var(--brand-accent)] focus:ring-2 focus:ring-[color:rgba(145,136,245,0.14)]";
  const actionButtonClass =
    "inline-flex items-center rounded-[16px] bg-[color:var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,4,65,0.18)] transition-colors hover:bg-[color:var(--brand-accent)] disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Equipo"
        title="Equipo"
        subtitle="Accesos y roles del negocio activo."
        actions={
          canMutate ? (
            <button
              onClick={() => {
                setShowForm(!showForm);
                setFormError(null);
                setEmail("");
                setRole("OPERATOR");
              }}
              className={actionButtonClass}
            >
              {showForm ? "Cancelar" : "Agregar miembro"}
            </button>
          ) : null
        }
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <MetricCard
          label="Miembros"
          value={members.length}
          tone="accent"
          hint="Accesos registrados"
        />
        <MetricCard
          label="Activos"
          value={activeMembers}
          hint="Pueden operar hoy"
        />
        <MetricCard
          label="Administradores y dueños"
          value={admins}
          tone="warm"
          hint="Perfiles con más permisos"
        />
      </section>

      {error || message ? (
        <div
          className={`rounded-[24px] border px-5 py-4 text-sm ${
            error
               "text-[color:var(--danger-text)]"
              : "text-[color:var(--success-text)]"
          }`}
        >
          {error  message}
        </div>
      ) : null}

      {showForm  (
        <SectionCard
          title="Agregar miembro"
          description="Invita a una persona y define su rol."
        >
          <form onSubmit={handleAdd} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="usuario@email.com"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Rol
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={inputClass}
                >
                  {ROLES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {formError  (
              <p className="rounded-[20px] border px-4 py-3 text-sm text-[color:var(--danger-text)]">
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className={actionButtonClass}
            >
              {saving  "Agregando..." : "Agregar miembro"}
            </button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Accesos" description="Listado de miembros y roles.">
        {members.length === 0  (
          <div className="rounded-[24px] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-muted)] px-6 py-10 text-center">
            <h3 className="text-2xl font-semibold text-[color:var(--foreground)]">
              Todavía no hay miembros
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[color:var(--text-muted)]">
              Cuando agregues miembros, van a aparecer acá.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] lg:block">
              <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_180px_160px_140px] gap-4 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)] px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                <div>Miembro</div>
                <div>Email</div>
                <div>Rol</div>
                <div>Estado</div>
                <div className="text-right">Acciones</div>
              </div>

              <div className="divide-y divide-[color:var(--border)]">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_180px_160px_140px] gap-4 px-6 py-5 hover:bg-[color:var(--surface-muted)]/55"
                  >
                    <div>
                      <p className="text-base font-semibold text-[color:var(--foreground)]">
                        {member.user.firstName} {member.user.lastName}
                      </p>
                    </div>
                    <div className="text-sm text-[color:var(--text-muted)]">
                      {member.user.email}
                    </div>
                    <div>
                      {canMutate ? (
                        <select
                          value={member.role}
                          onChange={(e) =>
                            handleChangeRole(member.id, e.target.value)
                          }
                          className="w-full rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--brand-accent)]"
                        >
                          {ROLES.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-[color:var(--text-muted)]">
                          {member.role}
                        </span>
                      )}
                    </div>
                    <div>
                      <AdminStatusBadge
                        tone={
                          member.status === "ACTIVE" ? "active" : "inactive"
                        }
                        label={member.status}
                      />
                    </div>
                    <div className="text-right">
                      {canMutate && member.status === "ACTIVE"  (
                        <button
                          onClick={() => handleRevoke(member.id)}
                          className="rounded-full border border-[color:rgba(250,171,75,0.22)] bg-[color:rgba(250,171,75,0.08)] px-3 py-2 text-xs font-semibold text-[color:var(--warning-text)] transition-colors hover:bg-[color:rgba(250,171,75,0.16)]"
                        >
                          Revocar
                        </button>
                      ) : (
                        <span className="text-xs text-[color:var(--text-soft)]">
                          -
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 lg:hidden">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-[color:var(--foreground)]">
                        {member.user.firstName} {member.user.lastName}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                        {member.user.email}
                      </p>
                    </div>
                    <AdminStatusBadge
                      tone={member.status === "ACTIVE" ? "active" : "inactive"}
                      label={member.status}
                    />
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                      Rol
                    </p>
                    {canMutate ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleChangeRole(member.id, e.target.value)
                        }
                        className={inputClass}
                      >
                        {ROLES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                        {member.role}
                      </p>
                    )}
                  </div>

                  {canMutate && member.status === "ACTIVE"  (
                    <button
                      onClick={() => handleRevoke(member.id)}
                      className="mt-5 rounded-full border border-[color:rgba(250,171,75,0.22)] bg-[color:rgba(250,171,75,0.08)] px-4 py-2 text-xs font-semibold text-[color:var(--warning-text)] transition-colors hover:bg-[color:rgba(250,171,75,0.16)]"
                    >
                      Revocar acceso
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
