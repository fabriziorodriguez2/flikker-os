"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";

const MIN_LENGTH = 8;

export default function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("La nueva contraseña debe ser distinta de la actual.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/proxy/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.message ?? "No pudimos cambiar la contraseña.");
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos cambiar la contraseña.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
        <p className="text-sm font-semibold text-[#12805c]">
          ✓ Contraseña actualizada
        </p>
        <p className="mt-1 text-sm text-[#8891A4]">
          Por seguridad cerramos las sesiones abiertas. Iniciá sesión de nuevo
          con tu contraseña nueva.
        </p>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/login");
            router.refresh();
          }}
          className="mt-4 inline-flex h-10 items-center rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
        >
          Ir al inicio de sesión
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-[12px] border border-[#E8EAF0] bg-white p-5"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[#1A202C]">
            Cambiar contraseña
          </p>
          <p className="text-xs text-[#8891A4]">
            Elegí tu propia contraseña. Mínimo {MIN_LENGTH} caracteres.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[#1A202C]">
            Contraseña actual
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="h-11 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-sm text-[#1A202C] outline-none focus:border-[#5C6BC0]"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[#1A202C]">
            Nueva contraseña
          </span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="h-11 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-sm text-[#1A202C] outline-none focus:border-[#5C6BC0]"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[#1A202C]">
            Confirmar nueva contraseña
          </span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-11 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-sm text-[#1A202C] outline-none focus:border-[#5C6BC0]"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-3 rounded-[8px] border border-[#C0392B]/20 bg-[#C0392B]/10 px-3 py-2 text-sm text-[#C0392B]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={
          saving || !currentPassword || !newPassword || !confirmPassword
        }
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {saving ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
