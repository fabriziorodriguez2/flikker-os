"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  BUSINESS_TIMEZONE_OPTIONS,
  BUSINESS_VERTICAL_OPTIONS,
  DEFAULT_BUSINESS_TIMEZONE,
  DEFAULT_BUSINESS_VERTICAL,
} from "@/lib/business-options";

interface PlatformBusiness {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: string;
  industry: string | null;
  country: string;
  createdAt: string;
  plan: string;
  planSlug: string;
  subscriptionStatus: string | null;
  branchCount: number;
  memberCount: number;
  customerCount: number;
  reviewCount: number;
}

interface CreateBusinessForm {
  name: string;
  legalName: string;
  vertical: string;
  country: string;
  timezone: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  whatsappPhone: string;
}

interface CreatedCredentials {
  business: PlatformBusiness;
  owner: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    reusedOwnerUser: boolean;
  };
  credentials: {
    loginUrl: string;
    email: string;
    temporaryPassword: string | null;
    businessName: string;
  };
}

const emptyCreateForm: CreateBusinessForm = {
  name: "",
  legalName: "",
  vertical: DEFAULT_BUSINESS_VERTICAL,
  country: "UY",
  timezone: DEFAULT_BUSINESS_TIMEZONE,
  ownerEmail: "",
  ownerFirstName: "",
  ownerLastName: "",
  whatsappPhone: "",
};

const inputClassName =
  "flikker-input flikker-focus-ring w-full px-3 py-2.5 text-sm";
const primaryButtonClassName =
  "rounded-[14px] bg-[color:var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-[color:var(--background)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const subtleButtonClassName =
  "rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--foreground)]";

export default function PlatformPage() {
  const [businesses, setBusinesses] = useState<PlatformBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateBusinessForm>(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [createdCredentials, setCreatedCredentials] =
    useState<CreatedCredentials | null>(null);

  useEffect(() => {
    async function boot() {
      try {
        await loadBusinesses();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setLoading(false);
      }
    }
    void boot();
  }, []);

  const stats = useMemo(() => {
    return {
      active: businesses.filter((business) => business.status === "ACTIVE")
        .length,
      onboarding: businesses.filter(
        (business) => business.status === "ONBOARDING",
      ).length,
      customers: businesses.reduce(
        (total, business) => total + business.customerCount,
        0,
      ),
      reviews: businesses.reduce(
        (total, business) => total + business.reviewCount,
        0,
      ),
    };
  }, [businesses]);

  async function loadBusinesses() {
    const res = await fetch("/api/proxy/platform/businesses");
    if (!res.ok) throw new Error("Error al cargar cuentas");
    setBusinesses(await res.json());
  }

  async function impersonate(business: PlatformBusiness) {
    setImpersonatingId(business.id);
    setError(null);

    try {
      const res = await fetch("/api/platform/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: business.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "No se pudo operar como negocio");
      }

      window.location.href = "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setImpersonatingId(null);
    }
  }

  async function createBusiness() {
    setCreating(true);
    setError(null);
    setCreatedCredentials(null);

    try {
      const res = await fetch("/api/proxy/platform/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message ?? "No se pudo crear el negocio");
      }

      setCreatedCredentials(data as CreatedCredentials);
      setCreateForm(emptyCreateForm);
      await loadBusinesses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  async function copyCredentials() {
    if (!createdCredentials) return;
    const { credentials } = createdCredentials;
    await navigator.clipboard.writeText(
      [
        `URL: ${credentials.loginUrl}`,
        `Negocio: ${credentials.businessName}`,
        `Email: ${credentials.email}`,
        credentials.temporaryPassword
          ? `Contrasena temporal: ${credentials.temporaryPassword}`
          : "Contrasena temporal: usuario existente, usar contrasena actual o recuperar acceso",
      ].join("\n"),
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="flikker-card rounded-[22px] p-5 text-sm text-[color:var(--text-muted)]">
          Cargando cuentas...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
              Plataforma
            </p>
            <h1 className="mt-2 text-[1.8rem] font-semibold text-[color:var(--foreground)] md:text-[2.1rem]">
              Cuentas ({businesses.length})
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--text-muted)]">
              Consola operativa del fundador para alta, onboarding e
              impersonation de negocios.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className={primaryButtonClassName}
          >
            {showCreate ? "Cerrar alta" : "Crear negocio"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Activos" value={stats.active} />
          <MetricCard label="En onboarding" value={stats.onboarding} />
          <MetricCard label="Pacientes" value={stats.customers} />
          <MetricCard label="Resenas detectadas" value={stats.reviews} />
        </div>
      </section>

      {error ? (
        <div
          className="rounded-[18px] border px-4 py-3 text-sm text-[color:var(--danger-text)]"
          style={{
            backgroundColor: "var(--danger-bg)",
            borderColor: "rgba(161,45,58,0.18)",
          }}
        >
          {error}
        </div>
      ) : null}

      {showCreate ? (
        <section className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[color:var(--foreground)]">
              Crear nuevo negocio
            </h2>
            <p className="text-sm text-[color:var(--text-muted)]">
              El negocio queda en onboarding y se genera un usuario OWNER para
              el dueno.
            </p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Input
              label="Nombre"
              value={createForm.name}
              onChange={(name) => setCreateForm({ ...createForm, name })}
            />
            <Input
              label="Nombre legal"
              value={createForm.legalName}
              onChange={(legalName) =>
                setCreateForm({ ...createForm, legalName })
              }
            />
            <Select
              label="Vertical/rubro"
              value={createForm.vertical}
              onChange={(vertical) =>
                setCreateForm({ ...createForm, vertical })
              }
              options={BUSINESS_VERTICAL_OPTIONS}
            />
            <Input
              label="Pais"
              value={createForm.country}
              onChange={(country) => setCreateForm({ ...createForm, country })}
            />
            <Select
              label="Timezone"
              value={createForm.timezone}
              onChange={(timezone) =>
                setCreateForm({ ...createForm, timezone })
              }
              options={BUSINESS_TIMEZONE_OPTIONS}
            />
            <Input
              label="Email dueno"
              type="email"
              value={createForm.ownerEmail}
              onChange={(ownerEmail) =>
                setCreateForm({ ...createForm, ownerEmail })
              }
            />
            <Input
              label="Nombre dueno"
              value={createForm.ownerFirstName}
              onChange={(ownerFirstName) =>
                setCreateForm({ ...createForm, ownerFirstName })
              }
            />
            <Input
              label="Apellido dueno"
              value={createForm.ownerLastName}
              onChange={(ownerLastName) =>
                setCreateForm({ ...createForm, ownerLastName })
              }
            />
            <Input
              label="WhatsApp negocio"
              value={createForm.whatsappPhone}
              onChange={(whatsappPhone) =>
                setCreateForm({ ...createForm, whatsappPhone })
              }
            />
          </div>
          <button
            type="button"
            onClick={() => void createBusiness()}
            disabled={creating}
            className={`${primaryButtonClassName} mt-5`}
          >
            {creating ? "Creando..." : "Crear y generar credenciales"}
          </button>
        </section>
      ) : null}

      {createdCredentials ? (
        <section className="rounded-[24px] border border-[color:rgba(46,125,77,0.35)] bg-[color:var(--success-bg)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--success-text)]">
                Credenciales temporales
              </h2>
              <p className="mt-1 text-sm text-[color:var(--success-text)]/90">
                Copialas ahora. La contrasena no se vuelve a mostrar.
              </p>
              {createdCredentials.owner.reusedOwnerUser ? (
                <p className="mt-2 text-xs text-[color:var(--warning-text)]">
                  El usuario dueno ya existia. No se cambio su contrasena; usar
                  recuperacion si no la recuerda.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void copyCredentials()}
              className="rounded-[14px] bg-[color:var(--success-text)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Copiar credenciales
            </button>
          </div>
          <pre className="mt-4 overflow-x-auto rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-sm leading-6 text-[color:var(--foreground)]">{`URL: ${createdCredentials.credentials.loginUrl}
Negocio: ${createdCredentials.credentials.businessName}
Email: ${createdCredentials.credentials.email}
Contrasena temporal: ${
            createdCredentials.credentials.temporaryPassword ??
            "usuario existente; usar contrasena actual o recuperar acceso"
          }`}</pre>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-1 border-b border-[color:var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--foreground)]">
              Negocios
            </h2>
            <p className="text-sm text-[color:var(--text-muted)]">
              Acciones rapidas por cuenta.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          {businesses.length === 0 ? (
            <p className="p-5 text-sm text-[color:var(--text-muted)]">
              No hay cuentas.
            </p>
          ) : (
            <table className="w-full min-w-[1120px] text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border)] bg-[color:var(--surface-muted)]/55">
                  <Th>Negocio</Th>
                  <Th>Plan</Th>
                  <Th>Estado</Th>
                  <Th>Pais</Th>
                  <Th align="right">Pacientes</Th>
                  <Th align="right">Resenas</Th>
                  <Th>Creado</Th>
                  <Th align="right">Accion</Th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => (
                  <tr
                    key={business.id}
                    className="border-b border-[color:var(--border)]/60 last:border-0 hover:bg-[color:var(--surface-muted)]/35"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <BusinessLogoPlaceholder
                          logoUrl={business.logoUrl}
                          name={business.name}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-[color:var(--foreground)]">
                            {business.name}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-soft)]">
                            <span>/{business.slug}</span>
                            {business.industry ? (
                              <span>{business.industry}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 py-1 text-xs font-medium text-[color:var(--text-muted)]">
                        {business.plan}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={business.status} />
                    </td>
                    <td className="px-4 py-4 text-[color:var(--text-muted)]">
                      {business.country}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-[color:var(--foreground)]">
                      {business.customerCount}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-[color:var(--foreground)]">
                      {business.reviewCount}
                    </td>
                    <td className="px-4 py-4 text-[color:var(--text-muted)]">
                      {formatDate(business.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/platform/businesses/${business.id}/onboarding`}
                          className={subtleButtonClassName}
                        >
                          Onboarding
                        </Link>
                        <Link
                          href={`/platform/businesses/${business.id}/onboarding#business`}
                          className={subtleButtonClassName}
                        >
                          Editar
                        </Link>
                        <button
                          type="button"
                          onClick={() => void impersonate(business)}
                          disabled={impersonatingId === business.id}
                          className="rounded-full bg-[#d90000] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#b80000] disabled:opacity-60"
                        >
                          {impersonatingId === business.id
                            ? "Entrando..."
                            : "Operar como negocio"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--surface-muted)]/45 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-[color:var(--foreground)]">
        {value.toLocaleString("es-UY")}
      </p>
    </article>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-[color:var(--text-muted)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1.5 block font-medium text-[color:var(--text-muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BusinessLogoPlaceholder({
  logoUrl,
  name,
}: {
  logoUrl: string | null;
  name: string;
}) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={`Logo de ${name}`}
          className="h-full w-full object-contain"
        />
      ) : null}
    </span>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "ACTIVE"
      ? "bg-[color:var(--success-bg)] text-[color:var(--success-text)]"
      : status === "ONBOARDING"
        ? "bg-[color:rgba(145,136,245,0.16)] text-[color:var(--brand-accent)]"
        : status === "DRAFT"
          ? "bg-[color:var(--warning-bg)] text-[color:var(--warning-text)]"
          : "bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]";

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {status}
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
