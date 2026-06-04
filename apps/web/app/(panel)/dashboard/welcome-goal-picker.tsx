"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Plazo = 30 | 60 | 90;
type Choice = "REVIEWS" | "CONTACTS" | "CAMPAIGN" | null;

interface WelcomeGoalPickerProps {
  onGoalCreated?: () => void;
  compact?: boolean;
}

export default function WelcomeGoalPicker({
  onGoalCreated,
  compact = false,
}: WelcomeGoalPickerProps) {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>(null);
  const [target, setTarget] = useState<string>("");
  const [plazo, setPlazo] = useState<Plazo>(30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (choice !== "REVIEWS" && choice !== "CONTACTS") return;
    const value = parseInt(target, 10);
    if (!Number.isFinite(value) || value < 1) {
      setError("Ingresá un número mayor a 0.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/business-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: choice,
          target: value,
          planDays: plazo,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "No se pudo guardar la meta");
      }
      onGoalCreated?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`rounded-[12px] border border-[#E8EAF0] bg-white ${
        compact ? "p-4" : "p-6"
      }`}
    >
      {!compact && (
        <>
          <p className="text-lg font-bold text-[#1A202C]">
            Bienvenido a Flikker
          </p>
          <p className="mt-1 text-sm text-[#8891A4]">
            ¿Qué querés lograr primero?
          </p>
        </>
      )}

      <div className={`${compact ? "" : "mt-5"} grid gap-3 sm:grid-cols-3`}>
        <GoalCard
          selected={choice === "REVIEWS"}
          onSelect={() => {
            setChoice("REVIEWS");
            setError(null);
          }}
          number="①"
          title="Meta de reseñas"
          description="Quiero llegar a X reseñas nuevas en Google"
        />
        <GoalCard
          selected={choice === "CONTACTS"}
          onSelect={() => {
            setChoice("CONTACTS");
            setError(null);
          }}
          number="②"
          title="Base de contactos"
          description="Quiero capturar X contactos nuevos con el QR"
        />
        <GoalCard
          selected={choice === "CAMPAIGN"}
          onSelect={() => {
            setChoice("CAMPAIGN");
            setError(null);
          }}
          number="③"
          title="Campaña personalizada"
          description="Quiero mandarle un mensaje a mis clientes"
        />
      </div>

      {(choice === "REVIEWS" || choice === "CONTACTS") && (
        <div className="mt-4 space-y-3 rounded-[10px] bg-[#F9F9FB] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-[#1A202C]">
                {choice === "REVIEWS" ? "Reseñas objetivo" : "Contactos objetivo"}
              </span>
              <input
                type="number"
                min={1}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={choice === "REVIEWS" ? "Ej: 30" : "Ej: 100"}
                className="h-10 w-full rounded-lg border border-[#E8EAF0] bg-white px-3 text-sm outline-none focus:border-[#5C6BC0]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-[#1A202C]">Plazo</span>
              <select
                value={plazo}
                onChange={(e) => setPlazo(Number(e.target.value) as Plazo)}
                className="h-10 w-full rounded-lg border border-[#E8EAF0] bg-white px-3 text-sm outline-none focus:border-[#5C6BC0]"
              >
                <option value={30}>30 días</option>
                <option value={60}>60 días</option>
                <option value={90}>90 días</option>
              </select>
            </label>
          </div>
          {error && (
            <p className="text-xs font-semibold text-[#C0392B]">{error}</p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-[8px] bg-[#5C6BC0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Crear meta"}
            </button>
          </div>
        </div>
      )}

      {choice === "CAMPAIGN" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[#F9F9FB] p-4">
          <p className="text-sm text-[#8891A4]">
            Te llevamos a Clientes para armar la campaña manual.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard/customers")}
            className="inline-flex items-center justify-center rounded-[8px] bg-[#5C6BC0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4e5db0]"
          >
            Crear campaña
          </button>
        </div>
      )}
    </div>
  );
}

function GoalCard({
  selected,
  onSelect,
  number,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  number: string;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-[10px] border p-4 text-left transition-colors ${
        selected
          ? "border-[#5C6BC0] bg-[#EEF0FB]"
          : "border-[#E8EAF0] hover:bg-[#F5F6FA]"
      }`}
    >
      <p className="text-xs font-semibold text-[#8891A4]">{number}</p>
      <p
        className={`mt-1 text-sm font-semibold ${
          selected ? "text-[#5C6BC0]" : "text-[#1A202C]"
        }`}
      >
        {title}
      </p>
      <p className="mt-1 text-xs text-[#8891A4]">{description}</p>
    </button>
  );
}
