"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface PlatformBusiness {
  id: string;
  name: string;
  slug: string;
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
  vertical: "",
  country: "UY",
  timezone: "America/Montevideo",
  ownerEmail: "",
  ownerFirstName: "",
  ownerLastName: "",
  whatsappPhone: "",
};

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
          ? `Contraseña temporal: ${credentials.temporaryPassword}`
          : "Contraseña temporal: usuario existente, usar contraseña actual o recuperar acceso",
      ].join("\n"),
    );
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Cargando cuentas...</p>;
  }

  return (
    <div className="max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Cuentas ({businesses.length})
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Consola operativa del fundador para alta, onboarding e
            impersonation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Crear negocio
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {showCreate && (
        <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-base font-semibold text-zinc-900">
            Crear nuevo negocio
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
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
            <Input
              label="Vertical/rubro"
              value={createForm.vertical}
              onChange={(vertical) =>
                setCreateForm({ ...createForm, vertical })
              }
            />
            <Input
              label="País"
              value={createForm.country}
              onChange={(country) => setCreateForm({ ...createForm, country })}
            />
            <Input
              label="Timezone"
              value={createForm.timezone}
              onChange={(timezone) =>
                setCreateForm({ ...createForm, timezone })
              }
            />
            <Input
              label="Email dueño"
              type="email"
              value={createForm.ownerEmail}
              onChange={(ownerEmail) =>
                setCreateForm({ ...createForm, ownerEmail })
              }
            />
            <Input
              label="Nombre dueño"
              value={createForm.ownerFirstName}
              onChange={(ownerFirstName) =>
                setCreateForm({ ...createForm, ownerFirstName })
              }
            />
            <Input
              label="Apellido dueño"
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
            className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {creating ? "Creando..." : "Crear y generar credenciales"}
          </button>
        </section>
      )}

      {createdCredentials && (
        <section className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-green-900">
                Credenciales temporales
              </h2>
              <p className="mt-1 text-sm text-green-800">
                Copialas ahora. La contraseña no se vuelve a mostrar.
              </p>
              {createdCredentials.owner.reusedOwnerUser ? (
                <p className="mt-2 text-xs text-amber-700">
                  El usuario dueño ya existía. No se cambió su contraseña; usá
                  recuperación si no la recuerda.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void copyCredentials()}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
            >
              Copiar credenciales
            </button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-white p-3 text-sm text-zinc-800">{`URL: ${createdCredentials.credentials.loginUrl}
Negocio: ${createdCredentials.credentials.businessName}
Email: ${createdCredentials.credentials.email}
Contraseña temporal: ${
            createdCredentials.credentials.temporaryPassword ??
            "usuario existente; usar contraseña actual o recuperar acceso"
          }`}</pre>
        </section>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        {businesses.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">No hay cuentas.</p>
        ) : (
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <Th>Negocio</Th>
                <Th>Plan</Th>
                <Th>Estado</Th>
                <Th>País</Th>
                <Th align="right">Pacientes</Th>
                <Th align="right">Reseñas</Th>
                <Th>Creado</Th>
                <Th align="right">Acción</Th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => (
                <tr
                  key={business.id}
                  className="border-b border-zinc-50 last:border-0"
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium text-zinc-900">
                        {business.name}
                      </span>
                      <span className="ml-1 text-xs text-zinc-400">
                        /{business.slug}
                      </span>
                    </div>
                    {business.industry && (
                      <span className="text-xs text-zinc-400">
                        {business.industry}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                      {business.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={business.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {business.country}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-500">
                    {business.customerCount}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-500">
                    {business.reviewCount}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {formatDate(business.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href={`/platform/businesses/${business.id}/onboarding`}
                        className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        Onboarding
                      </Link>
                      <Link
                        href={`/platform/businesses/${business.id}/onboarding#business`}
                        className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => void impersonate(business)}
                        disabled={impersonatingId === business.id}
                        className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Ver dashboard
                      </button>
                      <button
                        type="button"
                        onClick={() => void impersonate(business)}
                        disabled={impersonatingId === business.id}
                        className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
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
    </div>
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
      <span className="mb-1 block font-medium text-zinc-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
      />
    </label>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-2.5 font-medium text-zinc-600 ${
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
      ? "bg-green-50 text-green-700"
      : status === "ONBOARDING"
        ? "bg-blue-50 text-blue-700"
        : status === "DRAFT"
          ? "bg-amber-50 text-amber-700"
          : "bg-zinc-100 text-zinc-500";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${className}`}>
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
