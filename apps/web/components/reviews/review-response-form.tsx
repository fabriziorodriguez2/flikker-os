"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanMutate } from "@/app/(panel)/role-context";
import type { ReviewResponse } from "./types";

interface ReviewResponseFormProps {
  reviewId: string;
  initialResponse: ReviewResponse | null;
  initialRespondedAt: string | null;
  initialResponderName: string | null;
  initialLoadError?: string | null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-UY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAuthor(response: ReviewResponse | null, fallback: string | null) {
  if (response?.respondedBy) {
    const fullName = [
      response.respondedBy.firstName,
      response.respondedBy.lastName,
    ]
      .filter(Boolean)
      .join(" ");

    if (fullName.length > 0) return fullName;
  }

  return fallback;
}

export default function ReviewResponseForm({
  reviewId,
  initialResponse,
  initialRespondedAt,
  initialResponderName,
  initialLoadError,
}: ReviewResponseFormProps) {
  const router = useRouter();
  const canMutate = useCanMutate();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState(initialResponse?.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const responderName = useMemo(
    () => formatAuthor(initialResponse, initialResponderName),
    [initialResponse, initialResponderName],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const trimmed = content.trim();
    if (!trimmed) {
      setError("Escribe una respuesta antes de guardar.");
      return;
    }

    try {
      const path = initialResponse
        ? `/api/proxy/responses/${initialResponse.id}`
        : "/api/proxy/responses";
      const method = initialResponse ? "PATCH" : "POST";
      const body = initialResponse
        ? { content: trimmed }
        : { reviewId, content: trimmed };

      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "No se pudo guardar la respuesta");
      }

      setMessage(initialResponse ? "Respuesta actualizada" : "Respuesta guardada");
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar respuesta");
    }
  }

  return (
    <div className="flikker-card rounded-[28px] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
            Respuesta
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
            Registrar respuesta
          </h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
            {initialResponse
              ? "Puedes editar la respuesta guardada."
              : "Todavía no hay una respuesta guardada."}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
            initialRespondedAt
              ? "bg-[color:var(--success-bg)] text-[color:var(--success-text)]"
              : "border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)]"
          }`}
        >
          {initialRespondedAt ? "Respondida" : "Sin responder"}
        </span>
      </div>

      {(initialResponse || initialRespondedAt) && (
        <div className="mt-5 rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-5 py-5 text-sm">
          {initialResponse ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                Texto guardado
              </p>
              <p className="mt-3 whitespace-pre-wrap leading-7 text-[color:var(--foreground)]">
                {initialResponse.content}
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[color:var(--text-muted)]">
            <span>Fecha: {initialRespondedAt ? formatDate(initialRespondedAt) : "-"}</span>
            <span>Usuario: {responderName ?? "-"}</span>
          </div>
        </div>
      )}

      {initialLoadError ? (
        <div
          className="mt-5 rounded-[20px] border px-4 py-3 text-sm text-[color:var(--danger-text)]"
          style={{
            backgroundColor: "var(--danger-bg)",
            borderColor: "rgba(161,45,58,0.16)",
          }}
        >
          {initialLoadError}
        </div>
      ) : null}

      {canMutate ? (
        <form onSubmit={handleSubmit} className="mt-5">
          <label
            htmlFor="response-content"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]"
          >
            {initialResponse ? "Editar respuesta" : "Escribir respuesta"}
          </label>
          <textarea
            id="response-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            className="flikker-input mt-3 w-full px-4 py-4 text-sm leading-7"
            placeholder="Escribe la respuesta que quieres registrar."
          />

          {error ? (
            <p className="mt-3 text-sm text-[color:var(--danger-text)]">{error}</p>
          ) : null}
          {message ? (
            <p className="mt-3 text-sm text-[color:var(--success-text)]">{message}</p>
          ) : null}

          <button
            type="submit"
            disabled={isPending}
            className="mt-5 rounded-[16px] bg-[color:var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending
              ? "Guardando..."
              : initialResponse
                ? "Actualizar respuesta"
                : "Guardar respuesta"}
          </button>
        </form>
      ) : (
        <p className="mt-5 text-sm text-[color:var(--text-muted)]">
          Tienes acceso de solo lectura. Puedes ver la respuesta, pero no editarla.
        </p>
      )}
    </div>
  );
}
