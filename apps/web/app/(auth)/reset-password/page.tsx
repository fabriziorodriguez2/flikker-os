"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
  const emailFromLink = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(emailFromLink);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedEmail = String(formData.get("email") ?? "").trim();
    const newPassword = String(formData.get("password") ?? "");

    if (!token || !emailFromLink) {
      setError("El link no es válido o está incompleto.");
      return;
    }
    if (
      !submittedEmail ||
      submittedEmail.toLowerCase() !== emailFromLink.toLowerCase()
    ) {
      setError("El email debe coincidir con el de la cuenta.");
      return;
    }
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: submittedEmail, newPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message ?? "No pudimos cambiar la contraseña.");
      }
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ?
           err.message
          : "No pudimos cambiar la contraseña.",
      );
    } finally {
      setLoading(false);
    }
  }

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

        {done  (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#1A202C]">
              Contraseña actualizada
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#8891A4]">
              Ya podés ingresar con tu nueva contraseña.
            </p>
            <Link
              href="/login"
              className="mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-[#5C6BC0] text-sm font-semibold text-white hover:bg-[#4e5db0]"
            >
              Ir al inicio de sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[#1A202C]">
                Creá una nueva contraseña
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#8891A4]">
                Confirmá el email de la cuenta e ingresá una contraseña nueva.
              </p>
            </div>

            <div className="mt-6">
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-[#1A202C]"
              >
                Email de la cuenta
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="vos@negocio.com.uy"
                className="h-12 w-full rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
              />
            </div>

            <div className="mt-4">
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
                minLength={8}
                placeholder="••••••••"
                className="h-12 w-full rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
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
              {loading  "Guardando..." : "Guardar contraseña"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
