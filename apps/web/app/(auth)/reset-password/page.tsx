"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const MIN_LENGTH = 8;

/** The API answers with one generic message for unknown/used/expired tokens. */
const INVALID_TOKEN_MESSAGE =
  "El link de recuperación no es válido o ya venció. Pedí uno nuevo para continuar.";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenDead, setTokenDead] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (newPassword.length < MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok) {
        // Any token problem (invalid, already used, expired) lands here.
        if (response.status === 400) {
          setTokenDead(true);
          throw new Error(INVALID_TOKEN_MESSAGE);
        }
        throw new Error(data.message ?? "No pudimos cambiar la contraseña.");
      }
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos cambiar la contraseña.",
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "h-12 w-full rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F6FA] px-5 py-10">
      <section className="w-full max-w-[420px] rounded-xl border border-[#E8EAF0] bg-white px-8 py-8">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/flikker-logotype.svg"
            alt="Flikker"
            className="mx-auto h-auto w-[96px]"
          />
        </div>

        {done ? (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#1A202C]">
              Contraseña actualizada
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#8891A4]">
              Ya podés ingresar con tu nueva contraseña. Por seguridad cerramos
              las sesiones que estaban abiertas.
            </p>
            <Link
              href="/login"
              className="mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-[#5C6BC0] text-sm font-semibold text-white hover:bg-[#4e5db0]"
            >
              Ir al inicio de sesión
            </Link>
          </div>
        ) : !token || tokenDead ? (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#1A202C]">
              Link no válido
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#8891A4]">
              {INVALID_TOKEN_MESSAGE}
            </p>
            <Link
              href="/forgot-password"
              className="mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-[#5C6BC0] text-sm font-semibold text-white hover:bg-[#4e5db0]"
            >
              Pedir un link nuevo
            </Link>
            <Link
              href="/login"
              className="mt-3 flex h-12 w-full items-center justify-center rounded-lg border border-[#E8EAF0] text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
            >
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[#1A202C]">
                Creá una nueva contraseña
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#8891A4]">
                Elegí una contraseña nueva de al menos {MIN_LENGTH} caracteres.
              </p>
            </div>

            <div className="mt-6">
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-[#1A202C]"
              >
                Nueva contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_LENGTH}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            <div className="mt-4">
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-medium text-[#1A202C]"
              >
                Confirmar nueva contraseña
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_LENGTH}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            {error ? (
              <div className="mt-4 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-lg bg-[#5C6BC0] text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Guardando..." : "Guardar contraseña"}
            </button>

            <Link
              href="/login"
              className="mt-4 block text-center text-sm font-medium text-[#8891A4] hover:text-[#1A202C]"
            >
              Volver al inicio de sesión
            </Link>
          </form>
        )}
      </section>
    </main>
  );
}
