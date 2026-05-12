"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
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
  { value: "email", label: "Email (opcional)" },
  { value: "lastServiceAt", label: "Fecha último servicio" },
];

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
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importColumns, setImportColumns] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Array<Record<string, string>>>(
    [],
  );
  const [columnMapping, setColumnMapping] = useState<
    Record<string, ImportField>
  >({});
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
      if (!res.ok) throw new Error(data.message ?? "Error al importar CSV");
      const result = data as ImportResult;
      setImportResult(result);
      setMessage(
        `Importados: ${result.imported}. Duplicados: ${result.duplicates}. Fallidos: ${result.failed.length}`,
      );
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
    link.download = "plantilla-pacientes-flikker.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

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
          title="Importar pacientes"
          description="Subí un archivo .csv o .xlsx, revisá la vista previa y confirmá el mapeo."
        >
          <form onSubmit={handleImport} className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={downloadTemplate}
                className={secondaryButtonClass}
              >
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
              className={`block cursor-pointer rounded-[24px] border border-dashed px-6 py-8 text-center transition-colors ${
                dragActive
                  ? "border-[color:var(--brand-accent)] bg-[color:var(--surface-muted)]"
                  : "border-[color:var(--border-strong)] bg-[color:var(--surface)]"
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
              <span className="text-sm font-semibold text-[color:var(--foreground)]">
                Arrastrá tu archivo acá o hacé clic para seleccionarlo
              </span>
              <span className="mt-2 block text-xs text-[color:var(--text-muted)]">
                CSV o XLSX, máximo 5MB.
              </span>
              {importFile ? (
                <span className="mt-3 block text-sm text-[color:var(--brand-accent)]">
                  Archivo seleccionado: {importFile.name}
                </span>
              ) : null}
            </label>

            {importColumns.length > 0 ? (
              <div className="grid gap-5">
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--foreground)]">
                    Mapeo de columnas
                  </h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {importColumns.map((column) => (
                      <label key={column} className="grid gap-2 text-sm">
                        <span className="font-medium text-[color:var(--text-muted)]">
                          {column}
                        </span>
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

                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--foreground)]">
                    Vista previa
                  </h3>
                  <div className="mt-3 overflow-x-auto rounded-[18px] border border-[color:var(--border)]">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                        <tr>
                          {importColumns.map((column) => (
                            <th key={column} className="px-4 py-3">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 5).map((row, index) => (
                          <tr
                            key={index}
                            className="border-t border-[color:var(--border)]"
                          >
                            {importColumns.map((column) => (
                              <td key={column} className="px-4 py-3">
                                {row[column] || "-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {importResult ? (
              <div className="rounded-[18px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3 text-sm text-[color:var(--text-muted)]">
                <p>
                  Importados: {importResult.imported}. Duplicados:{" "}
                  {importResult.duplicates}. Fallidos:{" "}
                  {importResult.failed.length}.
                </p>
                {importResult.failed.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {importResult.failed.map((failure) => (
                      <li key={`${failure.row}-${failure.reason}`}>
                        Fila {failure.row}: {failure.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canMutate || saving || !importFile}
              className={actionButtonClass}
            >
              {saving ? "Importando..." : "Confirmar importación"}
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
          resolve({
            columns,
            rows: normalizePreviewRows(result.data, columns),
          });
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
    {
      defval: "",
      raw: false,
    },
  );
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return {
    columns,
    rows: normalizePreviewRows(rows, columns),
  };
}

function normalizePreviewRows(
  rows: Array<Record<string, unknown>>,
  columns: string[],
) {
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
      if (["telefono", "teléfono", "phone"].includes(normalized)) {
        field = "phone";
      }
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
