"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

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

type InitialPlanType = "FREE_TRIAL" | "BASE" | "PRO";

interface CreateForm {
  name: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  vertical: string;
  timezone: string;
  plan: InitialPlanType;
  trialGoal: string;
  trialStart: string;
  startDate: string;
  notes: string;
}

// Mirrors the backend's email.util validation: requires a real TLD, unlike the
// browser's type="email" which happily accepts "usuario@gmail".
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_CREATE_FORM: CreateForm = {
  name: "",
  ownerEmail: "",
  ownerFirstName: "",
  ownerLastName: "",
  vertical: "otro",
  timezone: "America/Montevideo",
  plan: "FREE_TRIAL",
  trialGoal: "25",
  trialStart: todayIsoDate(),
  startDate: todayIsoDate(),
  notes: "",
};

const PAGE_SIZE = 8;

export default function PlatformPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<PlatformBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PlatformBusiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncedId, setSyncedId] = useState<string | null>(null);
  const [backfillingId, setBackfillingId] = useState<string | null>(null);
  const [backfilledId, setBackfilledId] = useState<string | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ email: "", newPassword: "", confirmPassword: "" });
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    businessId: string;
    email: string;
    temporaryPassword: string | null;
    businessName: string;
  } | null>(null);


  useEffect(() => {
    async function boot() {
      try {
        await loadBusinesses();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos cargar negocios");
      } finally {
        setLoading(false);
      }
    }
    void boot();
  }, []);

  const stats = useMemo(
    () => ({
      active: businesses.filter((business) => business.status === "ACTIVE").length,
      reviews: businesses.reduce((total, business) => total + business.reviewCount, 0),
      messages: businesses.reduce((total, business) => total + business.customerCount, 0),
    }),
    [businesses],
  );

  const planOptions = useMemo(() => {
    const plans = Array.from(new Set(businesses.map((business) => business.plan).filter(Boolean)));
    return ["todos", ...plans];
  }, [businesses]);

  const filteredBusinesses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return businesses.filter((business) => {
      const matchesSearch =
        !query ||
        business.name.toLowerCase().includes(query) ||
        business.slug.toLowerCase().includes(query) ||
        (business.industry ?? "").toLowerCase().includes(query);
      const matchesPlan = planFilter === "todos" || business.plan === planFilter;
      const matchesStatus =
        statusFilter === "todos" || business.status.toLowerCase() === statusFilter;
      return matchesSearch && matchesPlan && matchesStatus;
    });
  }, [businesses, planFilter, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredBusinesses.length / PAGE_SIZE));
  const visibleBusinesses = filteredBusinesses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [planFilter, search, statusFilter]);

  async function loadBusinesses() {
    const res = await fetch("/api/proxy/platform/businesses");
    if (!res.ok) throw new Error("Error al cargar negocios");
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
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo operar como negocio");
      }

      window.location.href = "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setImpersonatingId(null);
    }
  }

  async function deleteBusiness(business: PlatformBusiness) {
    setDeletingId(business.id);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/platform/businesses/${business.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo borrar el negocio");
      }

      setPendingDelete(null);
      await loadBusinesses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar el negocio");
    } finally {
      setDeletingId(null);
    }
  }

  async function createBusiness() {
    setCreating(true);
    setCreateError(null);
    try {
      const isTrial = createForm.plan === "FREE_TRIAL";
      const goal = parseInt(createForm.trialGoal, 10);
      if (isTrial && (!Number.isFinite(goal) || goal < 1)) {
        setCreateError("La meta de reseñas debe ser un número mayor a 0.");
        setCreating(false);
        return;
      }

      // The browser's type="email" accepts TLD-less values like "usuario@gmail",
      // which produces an account nobody can log into. Require a real TLD.
      const ownerEmail = createForm.ownerEmail.trim().toLowerCase();
      if (!EMAIL_REGEX.test(ownerEmail)) {
        setCreateError(
          "El email del dueño no es válido. Revisá que incluya el dominio completo (ej: nombre@dominio.com).",
        );
        setCreating(false);
        return;
      }

      const initialPlan = isTrial
        ? {
            plan: createForm.plan,
            trialGoal: goal,
            trialStart: new Date(`${createForm.trialStart}T00:00:00`).toISOString(),
          }
        : {
            plan: createForm.plan,
            startDate: new Date(`${createForm.startDate}T00:00:00`).toISOString(),
            ...(createForm.notes.trim()
              ? { notes: createForm.notes.trim() }
              : {}),
          };

      const payload = {
        name: createForm.name,
        ownerEmail,
        ownerFirstName: createForm.ownerFirstName,
        ownerLastName: createForm.ownerLastName,
        vertical: createForm.vertical,
        timezone: createForm.timezone,
        initialPlan,
      };

      const res = await fetch("/api/proxy/platform/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo crear el negocio");
      }
      const data = (await res.json()) as {
        business: { id: string };
        credentials: {
          email: string;
          temporaryPassword: string | null;
          businessName: string;
        };
      };
      setShowCreateForm(false);
      setCreateForm(EMPTY_CREATE_FORM);
      setCreatedCredentials({
        businessId: data.business.id,
        email: data.credentials.email,
        temporaryPassword: data.credentials.temporaryPassword,
        businessName: data.credentials.businessName,
      });
      await loadBusinesses();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error al crear negocio");
    } finally {
      setCreating(false);
    }
  }

  async function syncReviews(business: PlatformBusiness) {
    setSyncingId(business.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/proxy/platform/businesses/${business.id}/sync-reviews`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo sincronizar reseñas");
      }
      setSyncedId(business.id);
      setTimeout(() => setSyncedId(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al sincronizar reseñas");
    } finally {
      setSyncingId(null);
    }
  }

  async function backfillReviews(business: PlatformBusiness) {
    if (
      !window.confirm(
        `¿Importar TODO el historial de reseñas de Google de "${business.name}"? Es una operación pesada (se corre en segundo plano) y solo hace falta una vez.`,
      )
    ) {
      return;
    }
    setBackfillingId(business.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/proxy/platform/businesses/${business.id}/backfill-reviews`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo importar el histórico");
      }
      setBackfilledId(business.id);
      setTimeout(() => setBackfilledId(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al importar el histórico");
    } finally {
      setBackfillingId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[#E8EAF0] bg-white p-5 text-sm text-[#8891A4]">
        Cargando negocios...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-[28px] font-bold leading-tight text-[#1A202C]">
            Negocios en la plataforma
          </h1>
          <p className="mt-2 text-sm text-[#8891A4]">
            Operá como cualquiera de ellos sin pedirles credenciales.
          </p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowPasswordForm(true);
                setPasswordError(null);
                setPasswordSuccess(null);
                setPasswordForm({ email: "", newPassword: "", confirmPassword: "" });
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Cambiar contraseña
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4e5db0]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo negocio
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Negocios activos" value={stats.active} />
            <MetricCard label="Reseñas detectadas" value={stats.reviews} />
            <MetricCard label="Clientes cargados" value={stats.messages} />
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[#E8EAF0] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#E8EAF0] p-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative w-full max-w-[320px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8891A4]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar negocio"
              className="h-10 w-full rounded-lg border border-[#E8EAF0] bg-white pl-11 pr-4 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Plan"
              value={planFilter}
              onChange={setPlanFilter}
              options={planOptions.map((plan) => ({
                value: plan,
                label: plan === "todos" ? "Todos" : plan,
              }))}
            />
            <FilterSelect
              label="Estado"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "todos", label: "Todos" },
                { value: "active", label: "Activo" },
                { value: "onboarding", label: "Onboarding" },
                { value: "inactive", label: "Inactivo" },
                { value: "suspended", label: "Pausa" },
              ]}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {visibleBusinesses.length === 0 ? (
            <p className="p-6 text-sm text-[#8891A4]">No hay negocios para mostrar.</p>
          ) : (
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-[#E8EAF0] bg-[#F5F6FA]/55 text-left">
                  <Th>Negocio</Th>
                  <Th>Plan</Th>
                  <Th>Estado</Th>
                  <Th>Último acceso</Th>
                  <Th align="right">Reseñas</Th>
                  <Th align="right">Clientes</Th>
                  <Th align="right">Acción</Th>
                </tr>
              </thead>
              <tbody>
                {visibleBusinesses.map((business) => (
                  <tr
                    key={business.id}
                    className="border-b border-[#E8EAF0] last:border-0 hover:bg-[#F5F6FA]/55"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <BusinessLogo logoUrl={business.logoUrl} name={business.name} />
                        <div className="min-w-0">
                          <Link
                            href={`/platform/businesses/${business.id}/onboarding`}
                            className="font-semibold text-[#1A202C] hover:text-[#5C6BC0]"
                          >
                            {business.name}
                          </Link>
                          <p className="mt-1 text-xs text-[#8891A4]">/{business.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-[#EEF0FB] px-3 py-1 text-xs font-semibold text-[#5C6BC0]">
                        {business.plan}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={business.status} />
                    </td>
                    <td className="px-4 py-4 text-[#1A202C]">{relativeDate(business.createdAt)}</td>
                    <td className="px-4 py-4 text-right font-bold text-[#1A202C]">
                      {business.reviewCount.toLocaleString("es-UY")}
                    </td>
                    <td className="px-4 py-4 text-right text-[#1A202C]">
                      {business.customerCount.toLocaleString("es-UY")}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void syncReviews(business)}
                          disabled={syncingId === business.id}
                          title="Sincronizar reseñas"
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:opacity-60 ${
                            syncedId === business.id
                              ? "border-[#639922]/30 bg-[#639922]/10 text-[#639922]"
                              : "border-[#E8EAF0] bg-white text-[#8891A4] hover:bg-[#F5F6FA] hover:text-[#5C6BC0]"
                          }`}
                          aria-label={`Sincronizar reseñas de ${business.name}`}
                        >
                          {syncedId === business.id ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <RefreshCw
                              className={`h-4 w-4 ${syncingId === business.id ? "animate-spin" : ""}`}
                              aria-hidden="true"
                            />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void backfillReviews(business)}
                          disabled={backfillingId === business.id}
                          title="Importar todo el historial de reseñas"
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:opacity-60 ${
                            backfilledId === business.id
                              ? "border-[#639922]/30 bg-[#639922]/10 text-[#639922]"
                              : "border-[#E8EAF0] bg-white text-[#8891A4] hover:bg-[#F5F6FA] hover:text-[#5C6BC0]"
                          }`}
                          aria-label={`Importar historial de reseñas de ${business.name}`}
                        >
                          {backfilledId === business.id ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <History
                              className={`h-4 w-4 ${backfillingId === business.id ? "animate-pulse" : ""}`}
                              aria-hidden="true"
                            />
                          )}
                        </button>
                        <Link
                          href={`/platform/businesses/${business.id}/onboarding`}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
                        >
                          Onboarding
                        </Link>
                        <Link
                          href={`/platform/businesses/${business.id}/plan`}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
                        >
                          Plan
                        </Link>
                        <button
                          type="button"
                          onClick={() => void impersonate(business)}
                          disabled={impersonatingId === business.id}
                          className="inline-flex h-9 items-center justify-center rounded-lg bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:opacity-60"
                        >
                          {impersonatingId === business.id ? "Entrando..." : "Operar como negocio"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(business)}
                          disabled={deletingId === business.id}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E8EAF0] bg-white text-[#C0392B] hover:bg-[#FBEDEC] disabled:opacity-60"
                          aria-label={`Borrar ${business.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#E8EAF0] px-4 py-4 text-sm text-[#8891A4]">
          <span>
            Mostrando {visibleBusinesses.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-
            {Math.min(page * PAGE_SIZE, filteredBusinesses.length)} de{" "}
            {filteredBusinesses.length} negocios
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E8EAF0] bg-white text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-45"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E8EAF0] bg-white text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-45"
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-business-title"
            className="w-full max-w-md rounded-xl border border-[#E8EAF0] bg-white p-6"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#C0392B]/10 text-[#C0392B]">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="delete-business-title" className="text-lg font-bold text-[#1A202C]">
                  Borrar negocio
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#8891A4]">
                  ¿Querés borrar{" "}
                  <span className="font-semibold text-[#1A202C]">{pendingDelete.name}</span>? El
                  negocio se va a archivar y dejará de aparecer en el panel admin.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deletingId === pendingDelete.id}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void deleteBusiness(pendingDelete)}
                disabled={deletingId === pendingDelete.id}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#C0392B] px-4 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-60"
              >
                {deletingId === pendingDelete.id ? "Borrando..." : "Borrar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-business-title"
            className="w-full max-w-lg rounded-xl border border-[#E8EAF0] bg-white p-6"
          >
            <h2 id="create-business-title" className="text-lg font-bold text-[#1A202C]">
              Nuevo negocio
            </h2>

            {createError ? (
              <div className="mt-3 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
                {createError}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                  Nombre del negocio *
                </label>
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Centro Salud Pocitos"
                  className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                    Nombre del dueño *
                  </label>
                  <input
                    value={createForm.ownerFirstName}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, ownerFirstName: e.target.value }))
                    }
                    placeholder="Juan"
                    className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                    Apellido del dueño *
                  </label>
                  <input
                    value={createForm.ownerLastName}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, ownerLastName: e.target.value }))
                    }
                    placeholder="Pérez"
                    className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                  Email del dueño *
                </label>
                <input
                  type="email"
                  value={createForm.ownerEmail}
                  onChange={(e) => setCreateForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                  placeholder="juan@negocio.com"
                  className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                    Vertical
                  </label>
                  <select
                    value={createForm.vertical}
                    onChange={(e) => setCreateForm((f) => ({ ...f, vertical: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm text-[#1A202C] outline-none focus:border-[#5C6BC0]"
                  >
                    <option value="dental">Dental</option>
                    <option value="estetica">Estética</option>
                    <option value="fisio">Fisio</option>
                    <option value="medico">Médico</option>
                    <option value="nutricion">Nutrición</option>
                    <option value="gimnasio">Gimnasio</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                    Zona horaria
                  </label>
                  <select
                    value={createForm.timezone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, timezone: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm text-[#1A202C] outline-none focus:border-[#5C6BC0]"
                  >
                    <option value="America/Montevideo">Uruguay</option>
                    <option value="America/Buenos_Aires">Argentina</option>
                    <option value="America/Santiago">Chile</option>
                    <option value="America/Sao_Paulo">Brasil</option>
                    <option value="America/Bogota">Colombia</option>
                    <option value="America/Lima">Perú</option>
                    <option value="America/Mexico_City">México</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-[#E8EAF0] pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                  Plan inicial
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(["FREE_TRIAL", "BASE", "PRO"] as InitialPlanType[]).map((p) => {
                    const labels: Record<InitialPlanType, { title: string; sub: string }> = {
                      FREE_TRIAL: { title: "① Prueba gratis", sub: "Piloto con meta de reseñas" },
                      BASE: { title: "② Plan Base", sub: "$1.000 UYU/mes" },
                      PRO: { title: "③ Plan Pro", sub: "$2.000 UYU/mes" },
                    };
                    const selected = createForm.plan === p;
                    return (
                      <label
                        key={p}
                        className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                          selected
                            ? "border-[#5C6BC0] bg-[#EEF0FB]"
                            : "border-[#E8EAF0] hover:bg-[#F5F6FA]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="initial-plan"
                          value={p}
                          checked={selected}
                          onChange={() => setCreateForm((f) => ({ ...f, plan: p }))}
                          className="sr-only"
                        />
                        <p
                          className={`text-sm font-semibold ${selected ? "text-[#5C6BC0]" : "text-[#1A202C]"}`}
                        >
                          {labels[p].title}
                        </p>
                        <p className="mt-0.5 text-xs text-[#8891A4]">{labels[p].sub}</p>
                      </label>
                    );
                  })}
                </div>

                {createForm.plan === "FREE_TRIAL" ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                        Meta de reseñas
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={createForm.trialGoal}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, trialGoal: e.target.value }))
                        }
                        className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm outline-none focus:border-[#5C6BC0]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                        Inicio del piloto
                      </label>
                      <input
                        type="date"
                        value={createForm.trialStart}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, trialStart: e.target.value }))
                        }
                        className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm outline-none focus:border-[#5C6BC0]"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                        Inicio de facturación
                      </label>
                      <input
                        type="date"
                        value={createForm.startDate}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, startDate: e.target.value }))
                        }
                        className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm outline-none focus:border-[#5C6BC0] sm:max-w-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                        Notas internas
                      </label>
                      <textarea
                        value={createForm.notes}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, notes: e.target.value }))
                        }
                        rows={2}
                        maxLength={2000}
                        className="w-full rounded-lg border border-[#E8EAF0] px-3 py-2 text-sm outline-none focus:border-[#5C6BC0]"
                        placeholder="Notas para el equipo admin..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateError(null);
                  setCreateForm(EMPTY_CREATE_FORM);
                }}
                disabled={creating}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void createBusiness()}
                disabled={creating}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:opacity-60"
              >
                {creating ? "Creando..." : "Crear negocio"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPasswordForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            className="w-full max-w-md rounded-xl border border-[#E8EAF0] bg-white p-6"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EEF0FB] text-[#5C6BC0]">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="change-password-title" className="text-lg font-bold text-[#1A202C]">
                  Cambiar contraseña
                </h2>
                <p className="mt-1 text-sm text-[#8891A4]">
                  Buscá la cuenta por email y seteale una nueva contraseña directamente.
                </p>
              </div>
            </div>

            {passwordError ? (
              <div className="mt-4 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
                {passwordError}
              </div>
            ) : null}

            {passwordSuccess ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#639922]/20 bg-[#639922]/10 px-4 py-3 text-sm text-[#639922]">
                <Check className="h-4 w-4 shrink-0" />
                {passwordSuccess}
              </div>
            ) : null}

            {!passwordSuccess ? (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                    Email de la cuenta
                  </label>
                  <input
                    type="email"
                    value={passwordForm.email}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="usuario@email.com"
                    className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                    Nueva contraseña
                  </label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
                    placeholder="Mínimo 8 caracteres"
                    className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1A202C]">
                    Confirmar contraseña
                  </label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder="Repetí la contraseña"
                    className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasswordForm(false)}
                disabled={passwordChanging}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-60"
              >
                {passwordSuccess ? "Cerrar" : "Cancelar"}
              </button>
              {!passwordSuccess ? (
                <button
                  type="button"
                  disabled={passwordChanging || !passwordForm.email.trim() || !passwordForm.newPassword || !passwordForm.confirmPassword}
                  onClick={async () => {
                    setPasswordError(null);
                    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                      setPasswordError("Las contraseñas no coinciden");
                      return;
                    }
                    if (passwordForm.newPassword.length < 8) {
                      setPasswordError("La contraseña debe tener al menos 8 caracteres");
                      return;
                    }
                    setPasswordChanging(true);
                    try {
                      const res = await fetch("/api/proxy/platform/users/change-password", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          email: passwordForm.email.trim(),
                          newPassword: passwordForm.newPassword,
                        }),
                      });
                      const data = (await res.json().catch(() => ({}))) as { message?: string; email?: string };
                      if (!res.ok) throw new Error(data.message ?? "No se pudo cambiar la contraseña");
                      setPasswordSuccess(`Contraseña actualizada para ${data.email ?? passwordForm.email.trim()}`);
                    } catch (e) {
                      setPasswordError(e instanceof Error ? e.message : "Error al cambiar contraseña");
                    } finally {
                      setPasswordChanging(false);
                    }
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:opacity-60"
                >
                  {passwordChanging ? "Cambiando..." : "Cambiar contraseña"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {createdCredentials ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="credentials-title"
            className="w-full max-w-md rounded-xl border border-[#E8EAF0] bg-white p-6"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#639922]/10 text-[#639922]">
                <Check className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="credentials-title" className="text-lg font-bold text-[#1A202C]">
                  Negocio creado
                </h2>
                <p className="mt-1 text-sm text-[#8891A4]">
                  Guardá estas credenciales antes de continuar. La contraseña no se vuelve a mostrar.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <CredentialRow label="Negocio" value={createdCredentials.businessName} />
              <CredentialRow label="Email" value={createdCredentials.email} copyable />
              {createdCredentials.temporaryPassword ? (
                <CredentialRow
                  label="Contraseña temporal"
                  value={createdCredentials.temporaryPassword}
                  copyable
                  highlight
                />
              ) : (
                <p className="rounded-lg border border-[#E8EAF0] bg-[#F5F6FA] px-4 py-3 text-sm text-[#8891A4]">
                  El usuario ya existía — se reutilizó su contraseña actual.
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = createdCredentials.businessId;
                  setCreatedCredentials(null);
                  router.push(`/platform/businesses/${id}/onboarding`);
                }}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4e5db0]"
              >
                Ir al onboarding
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

function CredentialRow({
  label,
  value,
  copyable = false,
  highlight = false,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  highlight?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${highlight ? "border-[#5C6BC0]/25 bg-[#EEF0FB]" : "border-[#E8EAF0] bg-[#F9F9FB]"}`}>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">{label}</p>
        <p className={`mt-0.5 font-mono text-sm font-semibold break-all ${highlight ? "text-[#3949AB]" : "text-[#1A202C]"}`}>
          {value}
        </p>
      </div>
      {copyable && (
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-[#E8EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#5C6BC0] hover:bg-[#F5F6FA]"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="min-w-[132px] rounded-lg border border-[#E8EAF0] bg-white px-4 py-3">
      <p className="text-xs font-semibold text-[#8891A4]">{label}</p>
      <p className="mt-2 text-xl font-bold text-[#1A202C]">
        {value.toLocaleString("es-UY")}
      </p>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 appearance-none rounded-lg border border-[#E8EAF0] bg-white px-4 pr-9 text-sm font-semibold text-[#1A202C] outline-none focus:border-[#5C6BC0]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {label}: {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8891A4]" />
    </label>
  );
}

function BusinessLogo({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F5F6FA] text-[#8891A4]">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`Logo de ${name}`} className="h-full w-full object-contain" />
      ) : (
        <Building2 className="h-4 w-4" aria-hidden="true" />
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const styles =
    normalized === "active"
      ? "bg-[#639922]/10 text-[#639922]"
      : normalized === "inactive"
        ? "bg-[#C0392B]/10 text-[#C0392B]"
        : normalized === "suspended"
          ? "bg-[#FFAB76]/20 text-[#9D5D0E]"
          : "bg-[#EEF0FB] text-[#5C6BC0]";
  const label =
    normalized === "active"
      ? "activo"
      : normalized === "inactive"
        ? "inactivo"
        : normalized === "suspended"
          ? "pausa"
          : "onboarding";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${styles}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#8891A4] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function relativeDate(value: string) {
  const date = new Date(value).getTime();
  const diffMs = Date.now() - date;
  const diffDays = Math.max(0, Math.floor(diffMs / 86_400_000));
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "ayer";
  if (diffDays < 7) return `hace ${diffDays} d`;
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}
