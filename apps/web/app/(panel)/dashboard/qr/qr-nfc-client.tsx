"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Plus,
  QrCode,
  Trash2,
} from "lucide-react";
import QRCode from "qrcode";
import PageHeader from "@/components/ui/page-header";
import RouteProgressBar from "@/components/ui/route-progress-bar";
import { useIsOwnerOrAdmin } from "../../role-context";
import PhysicalSupportNotice from "./physical-support-notice";

/**
 * QR y NFC — el acceso que usan los clientes del negocio.
 *
 * Un solo destino, `/check-in/{token}`, hace TODO el recorrido del cliente:
 * registra la visita, suma el sello, lo reconoce si ya vino, le muestra la
 * recompensa, le pide feedback y, si el negocio conectó Google, le ofrece
 * dejar la reseña. Por eso no hay "QR de sellos", "QR de reseñas" ni "QR de
 * registro": son la misma puerta, y separarlos partiría el recorrido en
 * journeys que compiten entre sí.
 *
 * El NFC tampoco es un destino aparte. El tag físico se graba con esta MISMA
 * URL, así que escanear el QR y acercar el celular caen exactamente en el
 * mismo lugar. Un punto de acceso = un token = un destino.
 *
 * La palabra "VisitSource" no aparece en pantalla a propósito: el dueño
 * administra "puntos de acceso", no filas de una tabla.
 */

interface AccessPoint {
  id: string;
  name: string;
  token: string;
  isDefault: boolean;
  isActive: boolean;
  scannedCount: number;
}

interface BusinessInfo {
  id: string;
  name?: string;
}

function checkinUrl(token: string): string {
  return `${window.location.origin}/check-in/${token}`;
}

export default function QrNfcClient() {
  const canManage = useIsOwnerOrAdmin();

  const [points, setPoints] = useState<AccessPoint[]>([]);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNameError, setNewNameError] = useState(false);
  const newNameInputRef = useRef<HTMLInputElement>(null);
  const [repairing, setRepairing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sourcesRes, bizRes] = await Promise.all([
        fetch("/api/proxy/visit-sources"),
        fetch("/api/proxy/businesses/current"),
      ]);
      if (!sourcesRes.ok) throw new Error("No pudimos cargar tus accesos.");
      setPoints((await sourcesRes.json()) as AccessPoint[]);
      if (bizRes.ok) setBusiness((await bizRes.json()) as BusinessInfo);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos cargar tus accesos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const principal = points.find((p) => p.isDefault) ?? null;
  const extras = points.filter((p) => !p.isDefault);

  // El QR que se ve en pantalla se dibuja en el cliente por velocidad, pero la
  // DESCARGA pide el PNG a la API (`/visit-sources/{id}/qr`) — misma URL
  // codificada, y es el endpoint que ya devuelve bytes PNG reales.
  useEffect(() => {
    if (!principal) return;
    void QRCode.toDataURL(checkinUrl(principal.token), {
      width: 640,
      margin: 2,
      errorCorrectionLevel: "M",
    }).then(setQrDataUrl);
  }, [principal]);

  async function copyLink(point: AccessPoint) {
    await navigator.clipboard.writeText(checkinUrl(point.token));
    setCopiedId(point.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function downloadQr(point: AccessPoint) {
    setBusyId(point.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/proxy/visit-sources/${point.id}/qr`);
      if (!res.ok) throw new Error("No pudimos generar el QR.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `qr-${point.name.toLowerCase().replace(/\s+/g, "-")}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No pudimos generar el QR.");
    } finally {
      setBusyId(null);
    }
  }

  async function mutate(
    path: string,
    init: RequestInit,
    fallbackMessage: string,
  ) {
    const res = await fetch(`/api/proxy/visit-sources${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) {
      const data: unknown = await res.json().catch(() => null);
      const message =
        data && typeof data === "object" && "message" in data
          ? String((data as { message: unknown }).message)
          : fallbackMessage;
      throw new Error(message);
    }
    await load();
  }

  async function toggleActive(point: AccessPoint) {
    setBusyId(point.id);
    setActionError(null);
    try {
      await mutate(
        `/${point.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: !point.isActive }),
        },
        "No pudimos actualizar el acceso.",
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusyId(null);
    }
  }

  async function removePoint(point: AccessPoint) {
    setBusyId(point.id);
    setActionError(null);
    try {
      await mutate(
        `/${point.id}`,
        { method: "DELETE" },
        "No pudimos eliminar el acceso.",
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusyId(null);
    }
  }

  async function createPoint() {
    const name = newName.trim();
    if (name.length < 2) {
      setNewNameError(true);
      newNameInputRef.current?.focus();
      return;
    }
    setNewNameError(false);
    setCreating(true);
    setActionError(null);
    try {
      await mutate(
        "",
        { method: "POST", body: JSON.stringify({ name }) },
        "No pudimos crear el acceso.",
      );
      setNewName("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setCreating(false);
    }
  }

  /**
   * Reparación del acceso principal. `GET /visit-sources` ya lo recrea de
   * forma idempotente para negocios en Check-in V2, así que "generar" es
   * simplemente volver a pedir la lista: no hay riesgo de crear dos.
   */
  async function repairPrincipal() {
    setRepairing(true);
    setActionError(null);
    try {
      await load();
    } finally {
      setRepairing(false);
    }
  }

  if (loading) {
    return <RouteProgressBar />;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 items-center rounded-[10px] border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:border-[#5C6BC0]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="QR y NFC"
        subtitle="Este es el acceso que usan tus clientes cada vez que visitan tu negocio."
        actions={
          principal?.isActive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF7EF] px-3 py-1.5 text-xs font-semibold text-[#147A5B]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22A06B]" />
              Activo
            </span>
          ) : null
        }
      />

      {actionError ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {actionError}
        </div>
      ) : null}

      <PhysicalSupportNotice
        businessId={business?.id}
        businessName={business?.name}
      />

      {/* ── 1. Tu acceso principal ──────────────────────────────────────── */}
      {principal ? (
        <section className="rounded-[18px] border border-[#E8EAF0] bg-white p-7 sm:p-9">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
            <div className="mx-auto shrink-0 rounded-[16px] border border-[#EFF1F7] bg-white p-4 sm:mx-0">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="QR de tu negocio"
                  className="h-52 w-52"
                />
              ) : (
                <div className="flex h-52 w-52 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-[#5C6BC0]" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-[#202333]">
                Tu QR
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#7F879C]">
                Tus clientes pueden escanearlo en cada visita para sumar sellos
                y ver sus recompensas.
              </p>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => void downloadQr(principal)}
                  disabled={busyId === principal.id}
                  className="inline-flex h-11 items-center gap-2 rounded-[11px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#4f5eb0] disabled:opacity-60"
                >
                  {busyId === principal.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Descargar QR
                </button>
                <button
                  type="button"
                  onClick={() => void copyLink(principal)}
                  className="inline-flex h-11 items-center gap-2 rounded-[11px] border border-[#E8EAF0] bg-white px-5 text-sm font-semibold text-[#1A202C] transition-colors hover:border-[#5C6BC0]"
                >
                  {copiedId === principal.id ? (
                    <Check className="h-4 w-4 text-[#22A06B]" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copiedId === principal.id ? "Copiado" : "Copiar enlace"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[18px] border border-[#E8EAF0] bg-white p-9 text-center">
          <QrCode className="mx-auto h-8 w-8 text-[#B0B8C9]" />
          <p className="mt-4 font-display text-lg font-semibold text-[#202333]">
            Todavía no tenés un QR principal.
          </p>
          <button
            type="button"
            onClick={() => void repairPrincipal()}
            disabled={repairing}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-[11px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-60"
          >
            {repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Generar mi QR
          </button>
        </section>
      )}

      {/* ── 2. Otros puntos de acceso, inmediatamente después de Tu QR ─ */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[#202333]">
              Otros puntos de acceso
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-[#7F879C]">
              Podés crear accesos distintos para saber desde dónde escanean tus
              clientes. Por ejemplo: Mostrador, Mesa 1, Terraza o Caja. Todos
              suman al mismo programa.
            </p>
          </div>
        </div>

        {extras.length > 0 ? (
          <ul className="mt-5 divide-y divide-[#EFF1F7] overflow-hidden rounded-[16px] border border-[#E8EAF0] bg-white">
            {extras.map((point) => (
              <li
                key={point.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#202333]">
                    {point.name}
                  </p>
                  <p className="mt-0.5 text-xs text-[#8891A4]">
                    {point.isActive ? "Activo" : "Desactivado"}
                    {/* El contador solo se muestra cuando hay algo que contar:
                        "0 accesos" en un punto recién creado no informa nada. */}
                    {point.scannedCount > 0
                      ? ` · ${point.scannedCount} ${
                          point.scannedCount === 1 ? "acceso" : "accesos"
                        }`
                      : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copyLink(point)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-xs font-semibold text-[#1A202C] hover:border-[#5C6BC0]"
                  >
                    {copiedId === point.id ? (
                      <Check className="h-3.5 w-3.5 text-[#22A06B]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedId === point.id ? "Copiado" : "Copiar link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadQr(point)}
                    disabled={busyId === point.id}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-xs font-semibold text-[#1A202C] hover:border-[#5C6BC0] disabled:opacity-60"
                  >
                    <Download className="h-3.5 w-3.5" />
                    QR
                  </button>
                  {canManage ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void toggleActive(point)}
                        disabled={busyId === point.id}
                        className="inline-flex h-9 items-center rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-xs font-semibold text-[#5F6780] hover:border-[#5C6BC0] disabled:opacity-60"
                      >
                        {point.isActive ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removePoint(point)}
                        disabled={busyId === point.id}
                        aria-label={`Eliminar ${point.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#E8EAF0] bg-white text-[#8891A4] hover:border-[#C0392B] hover:text-[#C0392B] disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-[16px] border border-dashed border-[#DDE1EC] bg-white px-5 py-6 text-sm text-[#8891A4]">
            Todavía no creaste otros puntos de acceso. Con tu QR principal ya
            alcanza para empezar.
          </p>
        )}

        {canManage ? (
          <div className="mt-5 rounded-[16px] border border-[#C9D0F4] bg-[#F8F8FF] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E7EAFE] text-[#4F5EB0]">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#171B35]">
                  Agregar otro punto de acceso
                </p>
                <p className="mt-0.5 text-sm text-[#707993]">
                  Creá un QR diferente para cada sector, mesa o caja.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-start">
              <div className="w-full sm:max-w-[300px]">
                <input
                  ref={newNameInputRef}
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (newNameError) setNewNameError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createPoint();
                  }}
                  placeholder="Ej: Terraza, Caja o Mesa 1"
                  maxLength={60}
                  aria-label="Nombre del punto de acceso"
                  aria-invalid={newNameError}
                  className={`h-12 w-full rounded-[11px] border bg-white px-4 text-sm text-[#202333] outline-none placeholder:text-[#A8B0C2] focus:ring-4 focus:ring-[#5C6BC0]/10 ${
                    newNameError
                      ? "border-[#D84A4A]"
                      : "border-[#C9CEE1] focus:border-[#5C6BC0]"
                  }`}
                />
                {newNameError ? (
                  <p className="mt-1.5 text-xs font-medium text-[#C23D3D]">
                    Escribí un nombre para crear el acceso.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void createPoint()}
                disabled={creating}
                className="flk-glossy inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[11px] bg-[#5C6BC0] px-6 text-sm font-bold text-white hover:bg-[#4F5EB0] disabled:cursor-wait disabled:opacity-70"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Crear acceso
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
