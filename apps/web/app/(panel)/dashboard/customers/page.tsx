"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  Edit2,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
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
  birthday: string | null;
}

interface CustomersResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
}

type ImportField = "ignore" | "name" | "phone" | "email" | "lastServiceAt";

interface ImportResult {
  imported: number;
  failed: Array<{ row: number; reason: string }>;
  duplicates: number;
}

const IMPORT_FIELD_OPTIONS: Array<{ value: ImportField; label: string }> = [
  { value: "ignore", label: "Ignorar" },
  { value: "name", label: "Nombre" },
  { value: "phone", label: "Teléfono" },
  { value: "email", label: "Email opcional" },
  { value: "lastServiceAt", label: "Fecha de atención" },
];

const inputClass =
  "h-10 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]";
const buttonBase =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-semibold transition-colors disabled:opacity-50";
const secondaryButton = `${buttonBase} border border-[#E8EAF0] bg-white text-[#1A202C] hover:bg-[#F5F6FA]`;
const primaryButton = `${buttonBase} bg-[#5C6BC0] text-white hover:bg-[#4f5eb0]`;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function CelebrationModal({ name, onDone }: { name: string; onDone: () => void }) {
  const [visible, setVisible] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const exitTimer = setTimeout(() => setVisible(false), 1300);
    const doneTimer = setTimeout(() => onDoneRef.current(), 1600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`flex flex-col items-center gap-5 rounded-2xl bg-white px-12 py-9 shadow-2xl transition-all duration-300 ${
          visible ? "scale-100 opacity-100" : "scale-90 opacity-0"
        }`}
      >
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#639922]/12">
          <Check strokeWidth={3} className="h-9 w-9 text-[#639922]" />
        </div>
        <div className="text-center">
          <p className="text-[18px] font-bold text-[#1A202C]">{name}</p>
          <p className="mt-1 text-sm text-[#8891A4]">Pedido de reseña programado ✓</p>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const canMutate = useCanMutate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrationName, setCelebrationName] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [lastServiceAt, setLastServiceAt] = useState("");
  const [birthday, setBirthday] = useState("");
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importColumns, setImportColumns] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Array<Record<string, string>>>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, ImportField>>({});
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

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
            : "Error al cargar clientes",
        );
      }
      setCustomers((data as CustomersResponse).data);
      setTotal((data as CustomersResponse).total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  function openNew() {
    setEditing(null);
    setName("");
    setPhone("");
    setLastServiceAt("");
    setBirthday("");
    setShowForm(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setName(customer.name);
    setPhone(customer.phoneE164);
    setLastServiceAt("");
    setBirthday(toDateInput(customer.birthday));
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidNationalPhone(toNationalDigits(phone))) {
      setError("Formato inválido. Ingresá entre 7 y 9 dígitos.");
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
          body: JSON.stringify({
            name,
            phone,
            lastServiceAt: lastServiceAt || undefined,
            birthday: birthday || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Error al guardar");
      setMessage(editing ? "Cliente actualizado" : "Cliente creado");
      setShowForm(false);
      await fetchCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(customer: Customer) {
    setMessage(null);
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/proxy/customers/${customer.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Error al archivar");
      setMessage("Cliente archivado");
      setPendingDelete(null);
      await fetchCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al archivar");
    } finally {
      setSaving(false);
    }
  }

  async function handleAttendedToday(customer: Customer) {
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
      if (!res.ok) throw new Error(data.message ?? "Error al registrar atención");
      setCelebrationName(customer.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar atención");
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) {
      setError("Seleccioná un archivo CSV o XLSX");
      return;
    }
    const mapping = buildImportMapping(columnMapping);
    if (!mapping.name || !mapping.phone) {
      setError("Mapeá al menos las columnas de nombre y teléfono");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.set("file", importFile);
      formData.set("mapping", JSON.stringify(mapping));
      const res = await fetch("/api/proxy/customers/import-csv", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Error al importar");
      const result = data as ImportResult;
      setImportResult(result);
      setMessage(
        `Importados: ${result.imported}. Duplicados: ${result.duplicates}. Fallidos: ${result.failed.length}`,
      );
      await fetchCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al importar");
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setMessage(null);
    setImportResult(null);
    try {
      const parsed = await parseImportFile(file);
      setImportFile(file);
      setImportColumns(parsed.columns);
      setImportRows(parsed.rows);
      setColumnMapping(inferColumnMapping(parsed.columns));
    } catch (e) {
      setImportFile(null);
      setImportColumns([]);
      setImportRows([]);
      setColumnMapping({});
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo");
    }
  }

  function downloadTemplate() {
    const csvTemplate = [
      "nombre,telefono,fecha_ultimo_servicio",
      "María García,091234567,2026-01-15",
      "Claudia Ruiz,099887766,2026-01-16",
    ].join("\n");
    const blob = new Blob([`\uFEFF${csvTemplate}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-clientes-flikker.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[22px] font-bold text-[#1A202C]">
          Clientes
        </h1>
      </div>

      {error || message ? (
        <div
          className={`rounded-[8px] border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-[#C0392B]"
              : "border-green-200 bg-green-50 text-[#639922]"
          }`}
        >
          {error ?? message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full max-w-[340px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8891A4]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-[8px] border border-[#E8EAF0] bg-white pl-10 pr-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
            placeholder="Buscar por nombre o teléfono"
          />
        </label>
        <div className="flex gap-2">
          {canMutate ? (
            <button
              className={secondaryButton}
              onClick={() => setShowImport((value) => !value)}
            >
              <Upload className="h-4 w-4" />
              Importar CSV
            </button>
          ) : null}
          <button className={primaryButton} onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </button>
        </div>
      </div>

      {showImport ? (
        <form
          onSubmit={handleImport}
          className="rounded-[12px] border border-[#E8EAF0] bg-white p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#1A202C]">
                Importar clientes
              </h2>
              <p className="mt-1 text-sm text-[#8891A4]">
                Subí un CSV o XLSX y confirmá el mapeo antes de importar.
              </p>
            </div>
            <button type="button" onClick={downloadTemplate} className={secondaryButton}>
              <Download className="h-4 w-4" />
              Descargar plantilla
            </button>
          </div>

          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={`mt-4 block cursor-pointer rounded-[12px] border border-dashed px-5 py-6 text-center text-sm transition-colors ${
              dragActive
                ? "border-[#5C6BC0] bg-[#EEF0FB]"
                : "border-[#E8EAF0] bg-[#F5F6FA]"
            }`}
          >
            <input
              type="file"
              accept=".csv,.xlsx"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <span className="font-semibold text-[#1A202C]">
              Arrastrá tu archivo acá o hacé clic para seleccionarlo
            </span>
            {importFile ? (
              <span className="mt-2 block text-[#5C6BC0]">{importFile.name}</span>
            ) : null}
          </label>

          {importColumns.length > 0 ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-[#1A202C]">
                  Mapeo de columnas
                </h3>
                <div className="mt-3 grid gap-2">
                  {importColumns.map((column) => (
                    <label key={column} className="grid grid-cols-2 items-center gap-2 text-sm">
                      <span className="text-[#8891A4]">{column}</span>
                      <select
                        className={inputClass}
                        value={columnMapping[column] ?? "ignore"}
                        onChange={(event) =>
                          setColumnMapping((current) => ({
                            ...current,
                            [column]: event.target.value as ImportField,
                          }))
                        }
                      >
                        {IMPORT_FIELD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
              <div className="overflow-hidden rounded-[8px] border border-[#E8EAF0]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F6FA] text-[#8891A4]">
                    <tr>
                      {importColumns.map((column) => (
                        <th key={column} className="px-3 py-2 font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 5).map((row, index) => (
                      <tr key={index} className="border-t border-[#E8EAF0]">
                        {importColumns.map((column) => (
                          <td key={column} className="px-3 py-2">
                            {row[column] || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {importResult ? (
            <p className="mt-4 text-sm text-[#8891A4]">
              Importados: {importResult.imported}. Duplicados:{" "}
              {importResult.duplicates}. Fallidos: {importResult.failed.length}.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canMutate || saving || !importFile}
            className={`${primaryButton} mt-4`}
          >
            {saving ? "Importando..." : "Confirmar importación"}
          </button>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-[12px] border border-[#E8EAF0] bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#F5F6FA] text-[11px] uppercase tracking-[0.08em] text-[#8891A4]">
            <tr>
              <th className="px-4 py-3 font-semibold">Nombre</th>
              <th className="px-4 py-3 font-semibold">Teléfono</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[#8891A4]">
                  Cargando clientes...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[#8891A4]">
                  No hay clientes para mostrar.
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.id} className="border-t border-[#E8EAF0]">
                  <td className="px-4 py-4 font-semibold text-[#1A202C]">
                    {customer.name}
                  </td>
                  <td className="px-4 py-4 text-[#1A202C]">
                    {customer.phoneE164}
                  </td>
                  <td className="px-4 py-4 text-[#1A202C]">
                    {formatDate(customer.createdAt)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleAttendedToday(customer)}
                        disabled={!canMutate || customer.optedOut}
                        className="inline-flex h-8 items-center gap-1 rounded-[8px] bg-[#639922] px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Atendido hoy
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(customer)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#E8EAF0] text-[#8891A4] hover:bg-[#F5F6FA]"
                        aria-label="Editar cliente"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(customer)}
                        disabled={!canMutate}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#E8EAF0] text-[#8891A4] hover:bg-[#F5F6FA] disabled:opacity-50"
                        aria-label="Archivar cliente"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[#8891A4]">
        Mostrando {customers.length} de {total} clientes
      </p>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-[12px] border border-[#E8EAF0] bg-white p-6"
          >
            <h2 className="text-lg font-bold text-[#1A202C]">
              {editing ? "Editar cliente" : "Nuevo cliente"}
            </h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              La fecha de nacimiento es opcional y se usa para cumpleaños.
            </p>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-[#1A202C]">
                Nombre
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="María García"
                  required
                />
              </label>
              <PhoneInput label="Teléfono" value={phone} onChange={setPhone} required />
              <label className="grid gap-2 text-sm font-semibold text-[#1A202C]">
                Fecha de alta / atención
                <input
                  type="date"
                  value={lastServiceAt}
                  onChange={(e) => setLastServiceAt(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#1A202C]">
                Fecha de nacimiento opcional
                <input
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>
              <button type="submit" disabled={saving || !canMutate} className={primaryButton}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {celebrationName ? (
        <CelebrationModal
          name={celebrationName}
          onDone={() => setCelebrationName(null)}
        />
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-customer-title"
            className="w-full max-w-md rounded-[12px] border border-[#E8EAF0] bg-white p-6"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#C0392B]/10 text-[#C0392B]">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="archive-customer-title"
                  className="text-lg font-bold text-[#1A202C]"
                >
                  Archivar cliente
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#8891A4]">
                  ¿Querés archivar a{" "}
                  <span className="font-semibold text-[#1A202C]">
                    {pendingDelete.name}
                  </span>
                  ? No va a aparecer en el listado principal.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setPendingDelete(null)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${buttonBase} bg-[#C0392B] text-white hover:bg-[#a93226]`}
                onClick={() => void handleDelete(pendingDelete)}
                disabled={saving || !canMutate}
              >
                {saving ? "Archivando..." : "Archivar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function parseImportFile(file: File): Promise<{
  columns: string[];
  rows: Array<Record<string, string>>;
}> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") {
    throw new Error("Solo se aceptan archivos .csv o .xlsx");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("El archivo no puede superar 5MB");
  }

  if (extension === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          if (result.errors.length > 0) {
            reject(new Error("No se pudo leer el CSV"));
            return;
          }
          const columns = result.meta.fields?.filter(Boolean) ?? [];
          resolve({ columns, rows: normalizePreviewRows(result.data, columns) });
        },
        error: () => reject(new Error("No se pudo leer el CSV")),
      });
    });
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return { columns: [], rows: [] };
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(
    workbook.Sheets[firstSheet],
    { defval: "", raw: false },
  );
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return { columns, rows: normalizePreviewRows(rows, columns) };
}

function normalizePreviewRows(rows: Array<Record<string, unknown>>, columns: string[]) {
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => [column, String(row[column] ?? "").trim()]),
    ),
  );
}

function inferColumnMapping(columns: string[]): Record<string, ImportField> {
  return Object.fromEntries(
    columns.map((column) => {
      const normalized = normalizeColumn(column);
      let field: ImportField = "ignore";
      if (["nombre", "name"].includes(normalized)) field = "name";
      if (["telefono", "teléfono", "phone"].includes(normalized)) field = "phone";
      if (normalized === "email") field = "email";
      if (
        [
          "fecha ultimo servicio",
          "fecha último servicio",
          "fecha_ultimo_servicio",
          "last service at",
          "last_service_at",
        ].includes(normalized)
      ) {
        field = "lastServiceAt";
      }
      return [column, field];
    }),
  );
}

function buildImportMapping(mapping: Record<string, ImportField>) {
  return Object.fromEntries(
    Object.entries(mapping)
      .filter(([, field]) => field !== "ignore")
      .map(([column, field]) => [field, column]),
  ) as Partial<Record<Exclude<ImportField, "ignore">, string>>;
}

function normalizeColumn(column: string) {
  return column.trim().toLowerCase().replace(/\s+/g, " ");
}
