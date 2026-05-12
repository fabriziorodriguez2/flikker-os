"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

interface Business {
  id: string;
  name: string;
  slug: string;
  status: string;
  vertical: string | null;
  timezone: string;
  phone: string | null;
  country: string;
  googlePlaceId: string | null;
  googleBusinessProfileUrl: string | null;
  defaultReviewRedirectUrl: string | null;
}

interface Template {
  id: string;
  name: string;
  templateKind: string;
  messageBody: string | null;
  triggerOffsetDays: number | null;
  offerText: string | null;
}

interface OnboardingData {
  business: Business;
  customerCount: number;
  templates: Template[];
}

interface TemplateDraft {
  messageBody: string;
  triggerOffsetDays: string;
  offerText: string;
}

const emptyBusiness: Business = {
  id: "",
  name: "",
  slug: "",
  status: "",
  vertical: "",
  timezone: "America/Montevideo",
  phone: "",
  country: "UY",
  googlePlaceId: "",
  googleBusinessProfileUrl: "",
  defaultReviewRedirectUrl: "",
};
const inputClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100";
const primaryButtonClassName =
  "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60";

export function OnboardingClient({ businessId }: { businessId: string }) {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [businessForm, setBusinessForm] = useState(emptyBusiness);
  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [csv, setCsv] = useState("");
  const [templates, setTemplates] = useState<Record<string, TemplateDraft>>({});
  const [testPhone, setTestPhone] = useState("");
  const [testName, setTestName] = useState("Paciente de prueba");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const next = await api<OnboardingData>(
        `/api/proxy/platform/businesses/${businessId}/onboarding`,
      );
      setData(next);
      setBusinessForm(next.business);
      setGooglePlaceId(next.business.googlePlaceId ?? "");
      setTemplates(
        Object.fromEntries(
          next.templates.map((template) => [
            template.id,
            {
              messageBody: template.messageBody ?? "",
              triggerOffsetDays: String(template.triggerOffsetDays ?? ""),
              offerText: template.offerText ?? "",
            },
          ]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar onboarding");
    } finally {
      setLoading(false);
    }
  }

  const generatedGoogleUrl = useMemo(() => {
    if (!googlePlaceId.trim()) return "";
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(
      googlePlaceId.trim(),
    )}`;
  }, [googlePlaceId]);

  async function saveBusiness() {
    await run("business", async () => {
      const updated = await api<Business>(
        `/api/proxy/platform/businesses/${businessId}/onboarding/business`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: businessForm.name,
            vertical: businessForm.vertical,
            timezone: businessForm.timezone,
            whatsappPhone: businessForm.phone,
          }),
        },
      );
      setData((current) =>
        current
          ? { ...current, business: { ...current.business, ...updated } }
          : current,
      );
      setNotice("Datos del negocio guardados.");
    });
  }

  async function saveGoogle() {
    await run("google", async () => {
      const updated = await api<
        Partial<Business> & { googleReviewUrl: string }
      >(`/api/proxy/platform/businesses/${businessId}/onboarding/google`, {
        method: "PATCH",
        body: JSON.stringify({ googlePlaceId }),
      });
      setData((current) =>
        current
          ? { ...current, business: { ...current.business, ...updated } }
          : current,
      );
      setNotice("Google Business Profile conectado.");
    });
  }

  async function importCustomers() {
    await run("csv", async () => {
      const result = await api<{
        created: number;
        errors: Array<{ row: number; message: string }>;
      }>(
        `/api/proxy/platform/businesses/${businessId}/onboarding/import-customers`,
        {
          method: "POST",
          body: JSON.stringify({ csv }),
        },
      );
      setNotice(
        `Importacion lista: ${result.created} pacientes creados, ${result.errors.length} errores.`,
      );
      await load();
    });
  }

  async function saveTemplates() {
    await run("templates", async () => {
      await api(
        `/api/proxy/platform/businesses/${businessId}/onboarding/templates`,
        {
          method: "PATCH",
          body: JSON.stringify({
            templates: Object.entries(templates).map(([campaignId, draft]) => ({
              campaignId,
              messageBody: draft.messageBody,
              triggerOffsetDays: draft.triggerOffsetDays
                ? Number(draft.triggerOffsetDays)
                : undefined,
              offerText: draft.offerText,
            })),
          }),
        },
      );
      setNotice("Plantillas guardadas.");
      await load();
    });
  }

  async function sendTestMessage() {
    await run("test", async () => {
      const result = await api<{ trackingUrl: string }>(
        `/api/proxy/platform/businesses/${businessId}/onboarding/test-message`,
        {
          method: "POST",
          body: JSON.stringify({ phone: testPhone, customerName: testName }),
        },
      );
      setNotice(`Mensaje de prueba enviado. Link: ${result.trackingUrl}`);
    });
  }

  async function completeOnboarding() {
    await run("complete", async () => {
      const updated = await api<Business>(
        `/api/proxy/platform/businesses/${businessId}/onboarding/complete`,
        { method: "POST" },
      );
      setData((current) =>
        current
          ? { ...current, business: { ...current.business, ...updated } }
          : current,
      );
      setNotice("Setup marcado como completo. El negocio quedo ACTIVE.");
    });
  }

  async function run(label: string, task: () => Promise<void>) {
    setSaving(label);
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Cargando onboarding...</p>;
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <Link
          href="/platform"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          Volver
        </Link>
        <p className="text-sm text-red-600">{error ?? "No se pudo cargar."}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/platform"
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Volver a cuentas
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
            Onboarding: {data.business.name}
          </h1>
          <p className="text-sm text-zinc-500">
            Estado {data.business.status} · {data.customerCount} pacientes
            activos
          </p>
        </div>
        <button
          type="button"
          onClick={() => void completeOnboarding()}
          disabled={saving === "complete"}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Marcar setup completo
        </button>
      </div>

      {notice && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">Negocio</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input
              className={inputClassName}
              value={businessForm.name}
              onChange={(e) =>
                setBusinessForm({ ...businessForm, name: e.target.value })
              }
            />
          </Field>
          <Field label="Vertical">
            <input
              className={inputClassName}
              value={businessForm.vertical ?? ""}
              onChange={(e) =>
                setBusinessForm({ ...businessForm, vertical: e.target.value })
              }
            />
          </Field>
          <Field label="Timezone">
            <input
              className={inputClassName}
              value={businessForm.timezone}
              onChange={(e) =>
                setBusinessForm({ ...businessForm, timezone: e.target.value })
              }
            />
          </Field>
          <Field label="WhatsApp Business">
            <input
              className={inputClassName}
              placeholder="+598..."
              value={businessForm.phone ?? ""}
              onChange={(e) =>
                setBusinessForm({ ...businessForm, phone: e.target.value })
              }
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => void saveBusiness()}
          disabled={saving === "business"}
          className={`${primaryButtonClassName} mt-4`}
        >
          Guardar negocio
        </button>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">
          Google Business Profile
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Buscar el negocio en Google Place ID Finder y pegar el Place ID. Se
          genera automaticamente el link de reseña.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Google place_id">
            <input
              className={inputClassName}
              value={googlePlaceId}
              onChange={(e) => setGooglePlaceId(e.target.value)}
            />
          </Field>
          <Field label="Google review URL">
            <input
              className={`${inputClassName} bg-zinc-50`}
              value={
                generatedGoogleUrl ||
                data.business.defaultReviewRedirectUrl ||
                ""
              }
              readOnly
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => void saveGoogle()}
          disabled={saving === "google"}
          className={`${primaryButtonClassName} mt-4`}
        >
          Conectar Google
        </button>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">
          Importacion de pacientes
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Formato: nombre, telefono, email, fecha ultimo servicio.
        </p>
        <textarea
          className="mt-4 min-h-36 w-full rounded-lg border border-zinc-200 p-3 text-sm"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={
            "nombre,telefono,email,fecha ultimo servicio\nMaria Garcia,099887766,maria@email.com,2026-05-10"
          }
        />
        <button
          type="button"
          onClick={() => void importCustomers()}
          disabled={saving === "csv"}
          className={`${primaryButtonClassName} mt-3`}
        >
          Importar CSV
        </button>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">
          Plantillas Repeats
        </h2>
        <div className="mt-4 space-y-4">
          {data.templates.map((template) => {
            const draft = templates[template.id] ?? {
              messageBody: "",
              triggerOffsetDays: "",
              offerText: "",
            };
            const preview = draft.messageBody
              .replaceAll("{nombre}", "Maria")
              .replaceAll("{clinica}", data.business.name)
              .replaceAll("{oferta}", draft.offerText || "tu beneficio");
            return (
              <div
                key={template.id}
                className="border-t border-zinc-100 pt-4 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold text-zinc-900">
                    {template.name}
                  </h3>
                  <span className="text-xs text-zinc-500">
                    {template.templateKind}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px]">
                  <textarea
                    className="min-h-24 rounded-lg border border-zinc-200 p-3 text-sm"
                    value={draft.messageBody}
                    onChange={(e) =>
                      setTemplates({
                        ...templates,
                        [template.id]: {
                          ...draft,
                          messageBody: e.target.value,
                        },
                      })
                    }
                  />
                  <div className="space-y-3">
                    <Field label="Dias offset">
                      <input
                        className={inputClassName}
                        type="number"
                        min="0"
                        value={draft.triggerOffsetDays}
                        onChange={(e) =>
                          setTemplates({
                            ...templates,
                            [template.id]: {
                              ...draft,
                              triggerOffsetDays: e.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="Oferta">
                      <input
                        className={inputClassName}
                        value={draft.offerText}
                        onChange={(e) =>
                          setTemplates({
                            ...templates,
                            [template.id]: {
                              ...draft,
                              offerText: e.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>
                <p className="mt-2 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600">
                  {preview || "Preview del mensaje con variables reemplazadas."}
                </p>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => void saveTemplates()}
          disabled={saving === "templates"}
          className={`${primaryButtonClassName} mt-4`}
        >
          Guardar plantillas
        </button>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">
          Mensaje de prueba
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Telefono de prueba">
            <input
              className={inputClassName}
              placeholder="+598..."
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </Field>
          <Field label="Nombre de prueba">
            <input
              className={inputClassName}
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => void sendTestMessage()}
          disabled={saving === "test"}
          className={`${primaryButtonClassName} mt-4`}
        >
          Enviar mensaje de prueba
        </button>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(payload.message ?? "Error de API");
  }
  return (await res.json()) as T;
}
