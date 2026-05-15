"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        setError(data.message ?? "Email o contraseña incorrectos");
        return;
      }

      router.push(data.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      setError("No pudimos conectar con el servidor. Probá de nuevo.");
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
          <p className="mt-4 text-sm text-[#8891A4]">Ingresá a tu negocio</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {searchParams.get("reason") === "session_expired" ? (
            <div className="rounded-lg border border-[#E8EAF0] bg-[#F5F6FA] px-4 py-3 text-sm text-[#5A6679]">
              Tu sesión expiró. Iniciá sesión de nuevo.
            </div>
          ) : null}

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-[#1A202C]"
            >
              Email
            </label>
            <div className="flex h-12 items-center rounded-lg border border-[#E8EAF0] bg-white px-3">
              <Mail className="h-4 w-4 shrink-0 text-[#8891A4]" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="tu@negocio.com"
                className="login-clean-input min-w-0 flex-1 bg-transparent px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-[#1A202C]"
            >
              Contraseña
            </label>
            <div className="flex h-12 items-center rounded-lg border border-[#E8EAF0] bg-white px-3">
              <Lock className="h-4 w-4 shrink-0 text-[#8891A4]" />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="login-clean-input min-w-0 flex-1 bg-transparent px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8891A4] hover:text-[#1A202C]"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <div className="mt-3 text-right">
              <Link
                href="/forgot-password"
                className="text-[13px] font-medium text-[#5C6BC0] hover:underline"
              >
                Olvidé mi contraseña
              </Link>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#5C6BC0] text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                />
                <span>Ingresando...</span>
              </>
            ) : (
              "Ingresar"
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
