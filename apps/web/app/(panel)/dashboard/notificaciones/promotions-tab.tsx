"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Megaphone, Send } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { useCanMutate } from "../../role-context";

/**
 * Promociones — lo que el dueño decide mandar.
 *
 * La diferencia con Automáticas es de autoría: acá el dueño elige el mensaje,
 * a quién y cuándo. Por eso no comparten lista ni configuración.
 *
 * Tres pasos y una confirmación. No hay segment builder ni programación: el
 * envío manual que existe hoy manda en el momento, así que no se inventa un
 * "programar para después" que después no cumpliría.
 */

const AUDIENCES = [
  {
    key: "todos",
    label: "Todos los clientes",
    hint: "Todos los que alguna vez se registraron",
  },
  {
    key: "volvieron",
    label: "Clientes que volvieron",
    hint: "Vinieron dos veces o más",
  },
  {
    key: "ausentes",
    label: "Hace tiempo que no vienen",
    hint: "Buen momento para invitarlos de vuelta",
  },
  {
    key: "cerca",
    label: "Cerca de completar su tarjeta",
    hint: "Les faltan uno o dos sellos",
  },
] as const;

type AudienceKey = (typeof AUDIENCES)[number]["key"];

interface Benefit {
  id: string;
  title: string;
}

export default function PromotionsTab() {
  const canSend = useCanMutate();

  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<AudienceKey>("todos");
  const [benefitId, setBenefitId] = useState("");
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentSummary, setSentSummary] = useState<{
    sent: number;
    failed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Solo se puede ofrecer el beneficio ACTIVO del negocio.
   *
   * No es una limitación arbitraria: es el único que el cliente puede abrir.
   * El check-in le muestra su beneficio con el código, y ahí se muestra el
   * activo. Ofrecer cualquier otro sería prometer algo que el cliente no tiene
   * dónde ver — que es exactamente lo que hay que evitar.
   */
  useEffect(() => {
    if (!creating) return;
    void fetch("/api/proxy/benefits")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: (Benefit & { active?: boolean })[]) =>
        setBenefits(rows.filter((b) => b.active)),
      )
      .catch(() => setBenefits([]));
  }, [creating]);

  // Cuántos van a recibirla. Es la misma consulta que después arma la lista,
  // no una estimación.
  const loadCount = useCallback(async (key: AudienceKey) => {
    setRecipientCount(null);
    try {
      const res = await fetch(
        `/api/proxy/notifications/promotions/preview?audience=${key}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { recipientCount: number };
      setRecipientCount(data.recipientCount);
    } catch {
      /* el conteo es informativo: si falla, el envío sigue disponible */
    }
  }, []);

  useEffect(() => {
    if (creating) void loadCount(audience);
  }, [creating, audience, loadCount]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/notifications/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          audience,
          ...(benefitId ? { benefitId } : {}),
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "message" in data
            ? String((data as { message: unknown }).message)
            : "No pudimos enviar la promoción.";
        throw new Error(msg);
      }
      const result = data as { sent: number; failed: number };
      setSentSummary({ sent: result.sent, failed: result.failed });
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setCreating(false);
    setConfirming(false);
    setSentSummary(null);
    setMessage("");
    setBenefitId("");
    setAudience("todos");
    setError(null);
  }

  // ── Enviada ────────────────────────────────────────────────────────────
  if (sentSummary) {
    return (
      <div className="rounded-[18px] border border-[#E8EAF0] bg-white px-6 py-12 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#EAF7EF] text-[#147A5B]">
          <Check className="h-5 w-5" />
        </span>
        <p className="mt-4 font-display text-lg font-semibold text-[#202333]">
          Promoción enviada
        </p>
        <p className="mt-2 text-sm text-[#7F879C]">
          {sentSummary.sent}{" "}
          {sentSummary.sent === 1 ? "cliente recibió" : "clientes recibieron"} tu
          mensaje
          {sentSummary.failed > 0
            ? ` · ${sentSummary.failed} no se pudieron entregar`
            : ""}
          .
        </p>
        <button
          type="button"
          onClick={reset}
          className="flk-glossy-secondary mt-6 inline-flex h-11 items-center rounded-[11px] border border-[#E3E5F0] bg-white px-5 text-sm font-semibold text-[#202333] hover:border-[#5C6BC0]"
        >
          Volver
        </button>
      </div>
    );
  }

  // ── Vacío ──────────────────────────────────────────────────────────────
  if (!creating) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-[#202333]">
              Promociones
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#7F879C]">
              Vos elegís qué mandar y cuándo. Para los mensajes que Flikker
              decide solo, mirá la pestaña Automáticas.
            </p>
          </div>
          {canSend ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flk-glossy inline-flex h-11 items-center rounded-[11px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
            >
              Crear promoción
            </button>
          ) : null}
        </div>

        <EmptyState
          icon={Megaphone}
          description={
            canSend
              ? "Todavía no enviaste promociones. Las que envíes van a aparecer en el Historial."
              : "Solo el dueño o un administrador pueden crear promociones."
          }
        />
      </div>
    );
  }

  // ── Confirmación ───────────────────────────────────────────────────────
  const selectedAudience = AUDIENCES.find((a) => a.key === audience)!;
  const selectedBenefit = benefits.find((b) => b.id === benefitId);

  if (confirming) {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7F879C] hover:text-[#202333]"
        >
          <ArrowLeft className="h-4 w-4" /> Editar
        </button>

        <div className="rounded-[16px] border border-[#E8EAF0] bg-white p-6">
          <h3 className="font-display text-lg font-semibold text-[#202333]">
            Revisá antes de enviar
          </h3>
          <dl className="mt-4 divide-y divide-[#EFF1F7]">
            <Row label="A quién" value={selectedAudience.label} />
            <Row
              label="Destinatarios"
              value={
                recipientCount === null
                  ? "Calculando…"
                  : `${recipientCount} ${recipientCount === 1 ? "cliente" : "clientes"}`
              }
            />
            <Row label="Beneficio" value={selectedBenefit?.title ?? "Sin beneficio"} />
          </dl>
          <div className="mt-4 rounded-[12px] bg-[#F7F8FC] px-4 py-3 text-sm leading-6 text-[#5F6780]">
            {message}
            {selectedBenefit ? `\n\n🎁 ${selectedBenefit.title}` : ""}
          </div>

          {error ? (
            <p className="mt-4 rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-[#C0392B]">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className="flk-glossy mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-60 sm:w-auto"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar promoción
          </button>
        </div>
      </div>
    );
  }

  // ── Editor ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7F879C] hover:text-[#202333]"
      >
        <ArrowLeft className="h-4 w-4" /> Promociones
      </button>

      <section>
        <Label>1. Mensaje</Label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
          rows={4}
          placeholder="Este viernes tenemos 2x1 en medialunas. Te esperamos."
          className="mt-2 w-full resize-none rounded-[12px] border border-[#E3E5F0] bg-white px-4 py-3 text-sm leading-6 text-[#202333] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
        />
        <p className="mt-1 text-right text-xs text-[#B0B8C9]">
          {message.length}/1000
        </p>
      </section>

      <section>
        <Label>2. A quién</Label>
        <div className="mt-2 space-y-2">
          {AUDIENCES.map((option) => (
            <label
              key={option.key}
              className={`flex cursor-pointer items-start gap-3 rounded-[12px] border p-3.5 transition-colors ${
                audience === option.key
                  ? "border-[#5C6BC0] bg-[#EEF0FB]"
                  : "border-[#E3E5F0] bg-white hover:border-[#5C6BC0]"
              }`}
            >
              <input
                type="radio"
                checked={audience === option.key}
                onChange={() => setAudience(option.key)}
                className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#202333]">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs text-[#8891A4]">
                  {option.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
        {recipientCount !== null ? (
          <p className="mt-2 text-xs text-[#7F879C]">
            {recipientCount}{" "}
            {recipientCount === 1 ? "cliente" : "clientes"} recibirían esta
            promoción.
          </p>
        ) : null}
      </section>

      <section>
        <Label>3. Beneficio (opcional)</Label>
        <select
          value={benefitId}
          onChange={(e) => setBenefitId(e.target.value)}
          className="mt-2 h-11 w-full rounded-[12px] border border-[#E3E5F0] bg-white px-3.5 text-sm text-[#202333] outline-none focus:border-[#5C6BC0]"
        >
          <option value="">Sin beneficio</option>
          {benefits.map((benefit) => (
            <option key={benefit.id} value={benefit.id}>
              {benefit.title}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs leading-5 text-[#8891A4]">
          {benefits.length === 0
            ? "No tenés ningún beneficio activo. Activá uno en Programa para poder ofrecerlo."
            : "Solo podés ofrecer tu beneficio activo, que es el que tus clientes ven al escanear. El mensaje va a incluir el link para que lo abran."}{" "}
          <Link
            href="/dashboard/programa?tab=configuracion&section=beneficios"
            className="font-semibold text-[#5C6BC0] hover:underline"
          >
            Ir a Programa
          </Link>
        </p>
      </section>

      {error ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={message.trim().length < 5}
        className="flk-glossy inline-flex h-11 w-full items-center justify-center rounded-[11px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        Continuar
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
      {children}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-[#7F879C]">{label}</dt>
      <dd className="text-right text-sm font-semibold text-[#202333]">
        {value}
      </dd>
    </div>
  );
}
