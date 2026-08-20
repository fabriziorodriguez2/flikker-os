"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, Loader2, Save, Upload } from "lucide-react";
import BusinessLogo from "@/components/business/business-logo";
import {
  BUSINESS_VERTICAL_OPTIONS,
  DEFAULT_BUSINESS_VERTICAL,
} from "@/lib/business-options";
import { useIsOwnerOrAdmin } from "../../role-context";

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

const COUNTRY_OPTIONS = [
  { value: "UY", label: "Uruguay (UYU)", currency: "UYU", timezone: "America/Montevideo" },
  { value: "AR", label: "Argentina (ARS)", currency: "ARS", timezone: "America/Buenos_Aires" },
  { value: "CL", label: "Chile (CLP)", currency: "CLP", timezone: "America/Santiago" },
  { value: "BR", label: "Brasil (BRL)", currency: "BRL", timezone: "America/Sao_Paulo" },
  { value: "CO", label: "Colombia (COP)", currency: "COP", timezone: "America/Bogota" },
  { value: "PE", label: "Perú (PEN)", currency: "PEN", timezone: "America/Lima" },
  { value: "MX", label: "México (MXN)", currency: "MXN", timezone: "America/Mexico_City" },
] as const;

interface Business {
  id: string;
  name: string;
  industry: string | null;
  vertical: string | null;
  country: string;
  timezone: string;
  currency: string;
  logoUrl: string | null;
  createdAt: string;
}

async function readJson(response: Response) {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "No pudimos guardar los cambios.";
    throw new Error(message);
  }
  return data;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("invalid file"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export default function CheckinV2BusinessSettings() {
  const router = useRouter();
  const canManage = useIsOwnerOrAdmin();
  const [business, setBusiness] = useState<Business | null>(null);
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [vertical, setVertical] = useState(DEFAULT_BUSINESS_VERTICAL);
  const [country, setCountry] = useState("UY");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/proxy/businesses/current");
      const data = (await readJson(response)) as Business;
      setBusiness(data);
      setName(data.name);
      setEditingName(false);
      setVertical(data.vertical ?? data.industry ?? DEFAULT_BUSINESS_VERTICAL);
      setCountry(data.country);
      setLogoUrl(data.logoUrl);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No pudimos cargar el negocio.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const verticalOptions = useMemo(() => {
    if (BUSINESS_VERTICAL_OPTIONS.some((option) => option.value === vertical)) {
      return BUSINESS_VERTICAL_OPTIONS;
    }
    return [...BUSINESS_VERTICAL_OPTIONS, { value: vertical, label: vertical }];
  }, [vertical]);

  const countryOptions = useMemo(() => {
    if (COUNTRY_OPTIONS.some((option) => option.value === country)) {
      return COUNTRY_OPTIONS;
    }
    return [
      ...COUNTRY_OPTIONS,
      {
        value: country,
        label: `${country} (${business?.currency ?? "—"})`,
        currency: business?.currency ?? "",
        timezone: business?.timezone ?? "",
      },
    ];
  }, [business?.currency, business?.timezone, country]);

  async function handleLogo(file: File | null) {
    setLogoError(null);
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setLogoError("Usá una imagen PNG, JPG, WebP o SVG.");
      return;
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setLogoError("El logo debe pesar menos de 2 MB.");
      return;
    }
    try {
      setLogoUrl(await readFileAsDataUrl(file));
      setMessage(null);
    } catch {
      setLogoError("No pudimos leer esa imagen.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!business || !canManage || saving || !name.trim()) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    const countryConfig = countryOptions.find((option) => option.value === country);
    const body: Record<string, string | null> = {};

    if (name.trim() !== business.name) body.name = name.trim();
    if (vertical !== (business.vertical ?? business.industry ?? DEFAULT_BUSINESS_VERTICAL)) {
      body.vertical = vertical;
      body.industry = vertical;
    }
    if (country !== business.country) {
      body.country = country;
      if (countryConfig?.currency) body.currency = countryConfig.currency;
      if (countryConfig?.timezone) body.timezone = countryConfig.timezone;
    }
    if (logoUrl !== business.logoUrl) body.logoUrl = logoUrl;

    if (Object.keys(body).length === 0) {
      setMessage("No hay cambios para guardar.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`/api/proxy/businesses/${business.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await readJson(response);
      setMessage("Cambios guardados.");
      await load();
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No pudimos guardar los cambios.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-[18px] border border-[#E8EAF0] bg-white text-sm text-[#8891A4]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando…
      </div>
    );
  }

  if (!business) {
    return (
      <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
        {error ?? "No pudimos cargar el negocio."}
      </div>
    );
  }

  const inputClass =
    "mt-2 h-12 w-full rounded-[12px] border border-[#DDE1EC] bg-white px-4 text-sm text-[#1A202C] outline-none placeholder:text-[#A0A8B8] focus:border-[#5C6BC0] focus:ring-2 focus:ring-[#5C6BC0]/10 disabled:cursor-not-allowed disabled:bg-[#F5F6FA] disabled:text-[#8891A4]";

  return (
    <section className="rounded-[18px] border border-[#E1E4EC] bg-white px-5 py-6 shadow-[0_2px_8px_rgba(17,22,59,0.025)] sm:px-7 sm:py-7 lg:px-10 lg:py-8">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#EEF0FB] text-[#5C6BC0]">
          <Building2 className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-bold text-[#1A202C]">Información del negocio</h2>
          <p className="mt-1 text-sm text-[#8891A4]">
            Actualizá la información básica de tu negocio.
          </p>
        </div>
      </div>

      {!canManage ? (
        <p className="mt-6 rounded-[12px] bg-[#F5F6FA] px-4 py-3 text-sm text-[#7F879C]">
          Estás viendo esta información en modo lectura.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-7 max-w-[720px] space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <BusinessLogo
            logoUrl={logoUrl}
            name={name || business.name}
            size="lg"
            className="h-20 w-20 rounded-[14px] border-[#E1E4EC] bg-[#F5F6FA]"
          />
          <div>
            {canManage ? (
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-[#DDE1EC] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F8F9FC]">
                <Upload className="h-4 w-4" aria-hidden="true" />
                Cambiar logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(event) => {
                    void handleLogo(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            ) : null}
            <p className="mt-2 text-xs text-[#8891A4]">
              PNG, JPG, WebP o SVG. Máximo 2 MB.
            </p>
            {logoError ? <p className="mt-1 text-xs text-[#C0392B]">{logoError}</p> : null}
          </div>
        </div>

        <div className="flex min-h-[58px] items-start justify-between gap-5 border-b border-[#EEF0F5] pb-5">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="business-name"
              className="block text-sm font-semibold text-[#1A202C]"
            >
              Nombre del negocio
            </label>
            {editingName ? (
              <input
                id="business-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
                autoFocus
                className={`${inputClass} max-w-[520px]`}
              />
            ) : (
              <p className="mt-2 truncate text-sm font-medium text-[#1A202C]">
                {name}
              </p>
            )}
          </div>

          {canManage ? (
            <button
              type="button"
              onClick={() => setEditingName((current) => !current)}
              className="flk-glossy-secondary mt-0.5 inline-flex h-8 shrink-0 items-center justify-center rounded-[9px] border border-[#E1E4EC] bg-white px-3 text-xs font-semibold text-[#1A202C] hover:border-[#C9D0F4] hover:text-[#4F5EB0]"
            >
              {editingName ? "Listo" : "Editar"}
            </button>
          ) : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="business-category" className="text-sm font-semibold text-[#1A202C]">
              Tipo de negocio
            </label>
            <select
              id="business-category"
              value={vertical}
              onChange={(event) => setVertical(event.target.value)}
              disabled={!canManage}
              className={inputClass}
            >
              {verticalOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="business-country" className="text-sm font-semibold text-[#1A202C]">
              País
            </label>
            <select
              id="business-country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              disabled={!canManage}
              className={inputClass}
            >
              {countryOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-[#8891A4]">
              Define la moneda y la configuración regional del negocio.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-[#EEF0F5] pt-5 text-sm text-[#7F879C]">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          Creado el {formatCreatedAt(business.createdAt)}
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          {canManage ? (
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(92,107,192,0.22)] hover:bg-[#4F5EB0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          ) : null}
          {error ? <p className="text-sm text-[#C0392B]">{error}</p> : null}
          {message ? <p className="text-sm font-medium text-[#1D9E75]">{message}</p> : null}
        </div>
      </form>
    </section>
  );
}
