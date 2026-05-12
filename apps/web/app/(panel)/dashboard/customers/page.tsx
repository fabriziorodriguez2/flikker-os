"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import PhoneInput, {
  isValidNationalPhone,
  toNationalDigits,
} from "@/components/ui/phone-input";
import { useCanMutate } from "../../role-context";

interface Customer {
  id: string;
  name: string;
  phoneE164: string;
  optedOut: boolean;
  createdAt: string;
}

interface CustomersResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
}

export default function CustomersPage() {
  const canMutate = useCanMutate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showImport, setShowImport] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [csv, setCsv] = useState("");
  const [saving, setSaving] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: "1", limit: "25" });
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [search]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/customers?${query}`);
      const data = (await res.json().catch(() => ({}))) as
        | CustomersResponse
        | { message?: string };
      if (!res.ok) {
        throw new Error(
          "message" in data && data.message
            ? data.message
            : "Error al cargar pacientes",
        );
      }
      setCustomers((data as CustomersResponse).data);
      setTotal((data as CustomersResponse).total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  function resetForm() {
    setEditing(null);
    setName("");
    setPhone("");
  }

  function startEdit(customer: Customer) {
    setEditing(customer);
    setName(customer.name);
    setPhone(customer.phoneE164);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidNationalPhone(toNationalDigits(phone))) {
      setError("Formato inválido — ingresá entre 7 y 9 dígitos");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(
        editing ? `/api/proxy/customers/${editing.id}` : "/api/proxy/customers",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, phone }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Error al guardar");
      setMessage(editing ? "Paciente actualizado" : "Paciente creado");
      resetForm();
      await fetchCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function handleOptOut(customerId: string) {
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/customers/${customerId}/opt-out`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Error al aplicar opt-out");
      setMessage("Opt-out aplicado");
      await fetchCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleAttendedToday(customer: Customer) {
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/proxy/service-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          serviceType: "Servicio",
          createdVia: "manual_panel",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message ?? "Error al registrar atención");
      }
      setMessage(
        `✓ ${customer.name} recibirá el pedido de reseña en las próximas 2 horas.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/proxy/customers/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Error al importar CSV");
      setMessage(
        `Importados: ${data.created ?? 0}. Errores: ${data.errors?.length ?? 0}`,
      );
      setCsv("");
      await fetchCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--text-soft)] focus:border-[color:var(--brand-accent)]";
  const actionButtonClass =
    "inline-flex items-center rounded-[16px] bg-[color:var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--brand-accent)] disabled:opacity-60";
  const secondaryButtonClass =
    "inline-flex items-center rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm font-semibold text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Pacientes"
        title="Pacientes"
        subtitle="Base operativa para pedidos de resenas y contactos."
        actions={
          canMutate ? (
            <button
              className={secondaryButtonClass}
              onClick={() => setShowImport((value) => !value)}
            >
              Importar CSV
            </button>
          ) : null
        }
      />

      {error || message ? (
        <div
          className={`rounded-[24px] border px-5 py-4 text-sm ${
            error
              ? "text-[color:var(--danger-text)]"
              : "text-[color:var(--success-text)]"
          }`}
        >
          {error ?? message}
        </div>
      ) : null}

      <SectionCard
        title={editing ? "Editar paciente" : "Nuevo paciente"}
        description="Telefono se normaliza a E.164 al guardar."
      >
        <form onSubmit={handleSave} className="grid gap-4 lg:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Nombre"
            required
          />
          <PhoneInput
            label="Teléfono"
            value={phone}
            onChange={setPhone}
            required
          />
          <div className="flex gap-2 self-end">
            <button
              type="submit"
              disabled={!canMutate || saving}
              className={actionButtonClass}
            >
              {saving ? "Guardando..." : editing ? "Actualizar" : "Crear"}
            </button>
            {editing ? (
              <button
                type="button"
                onClick={resetForm}
                className={secondaryButtonClass}
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </SectionCard>

      {showImport ? (
        <SectionCard
          title="Importar CSV"
          description="Formato: nombre, telefono, fecha ultimo servicio."
        >
          <form onSubmit={handleImport} className="space-y-4">
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              className={`${inputClass} min-h-40 font-mono`}
              placeholder={
                "nombre,telefono,fecha ultimo servicio\nAna Perez,099 123 456,2026-05-01"
              }
              required
            />
            <button
              type="submit"
              disabled={!canMutate || saving}
              className={actionButtonClass}
            >
              {saving ? "Importando..." : "Importar"}
            </button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Listado"
        description={`${total} pacientes activos encontrados.`}
      >
        <div className="mb-5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputClass}
            placeholder="Buscar por nombre o telefono"
          />
        </div>

        {loading ? (
          <div className="h-36 animate-pulse rounded-[24px] bg-[color:var(--surface-muted)]" />
        ) : customers.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-muted)] px-6 py-10 text-center text-sm text-[color:var(--text-muted)]">
            No hay pacientes para mostrar.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[24px] border border-[color:var(--border)]">
            {customers.map((customer) => (
              <div
                key={customer.id}
                className="grid gap-4 border-b border-[color:var(--border)] px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_180px_220px_220px]"
              >
                <div>
                  <p className="font-semibold text-[color:var(--foreground)]">
                    {customer.name}
                  </p>
                </div>
                <div className="text-sm text-[color:var(--text-muted)]">
                  {customer.phoneE164}
                </div>
                <div className="text-sm">
                  {customer.optedOut ? (
                    <span className="text-[color:var(--warning-text)]">
                      Opt-out
                    </span>
                  ) : (
                    <span className="text-[color:var(--success-text)]">
                      Contactable
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleAttendedToday(customer)}
                    disabled={!canMutate || customer.optedOut}
                    className={secondaryButtonClass}
                  >
                    Atendido hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(customer)}
                    className={secondaryButtonClass}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOptOut(customer.id)}
                    disabled={!canMutate || customer.optedOut}
                    className={secondaryButtonClass}
                  >
                    Opt-out
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
