"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { getSafeInternalPath } from "@/lib/safe-redirect";

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

  // Canje por URL — si vinimos de "/redeem/{token}" sin sesión, volvemos
  // exactamente ahí después del login en vez de al dashboard. Validado una
  // sola vez acá y reutilizado tanto para el aviso como para el redirect,
  // para no repetir la lógica de seguridad en dos lugares.
  const safeNext = getSafeInternalPath(searchParams.get("next"));

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

      router.push(safeNext ?? data.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      setError("No pudimos conectar con el servidor. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitShell>
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold text-[#6D5BE7]">
          Bienvenido de nuevo
        </p>
        <h2 className="text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#17142B] sm:text-[36px]">
          Ingresá a tu cuenta
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#7E7A91]">
          Accedé a tu panel y seguí haciendo crecer tu negocio.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {searchParams.get("reason") === "session_expired" ? (
          <div className="rounded-xl border border-[#E4E0FA] bg-[#F6F4FF] px-4 py-3 text-sm text-[#625B80]">
            Tu sesión expiró. Iniciá sesión de nuevo.
          </div>
        ) : safeNext?.startsWith("/redeem/") ? (
          <div className="rounded-xl border border-[#E4E0FA] bg-[#F6F4FF] px-4 py-3 text-sm text-[#625B80]">
            Iniciá sesión para continuar con el canje.
          </div>
        ) : null}

        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-semibold text-[#28243A]"
          >
            Email
          </label>
          <div className="flex h-[52px] items-center rounded-xl border border-[#DEDCE8] bg-white px-3.5 focus-within:border-[#7362E8] focus-within:shadow-[0_0_0_4px_rgba(115,98,232,0.10)]">
            <Mail className="h-[18px] w-[18px] shrink-0 text-[#9B97AA]" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="tu@negocio.com"
              className="login-clean-input min-w-0 flex-1 bg-transparent px-3 text-sm text-[#211D34] outline-none placeholder:text-[#AAA6B8]"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-4">
            <label
              htmlFor="password"
              className="text-sm font-semibold text-[#28243A]"
            >
              Contraseña
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-[#6251DA] hover:text-[#4635BB] hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="flex h-[52px] items-center rounded-xl border border-[#DEDCE8] bg-white px-3.5 focus-within:border-[#7362E8] focus-within:shadow-[0_0_0_4px_rgba(115,98,232,0.10)]">
            <Lock className="h-[18px] w-[18px] shrink-0 text-[#9B97AA]" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="login-clean-input min-w-0 flex-1 bg-transparent px-3 text-sm text-[#211D34] outline-none placeholder:text-[#AAA6B8]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9B97AA] hover:bg-[#F4F2FA] hover:text-[#3B354E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7362E8]"
            >
              {showPassword ? (
                <EyeOff className="h-[18px] w-[18px]" />
              ) : (
                <Eye className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#A22F24]"
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="flex h-[52px] w-full items-center justify-center rounded-xl bg-[#5B43E8] text-sm font-bold text-white shadow-[0_10px_24px_rgba(91,67,232,0.26)] hover:-translate-y-0.5 hover:bg-[#4D35D7] hover:shadow-[0_14px_28px_rgba(91,67,232,0.32)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5B43E8]/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
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

      <p className="mt-7 text-center text-sm text-[#7E7A91]">
        ¿Todavía no tenés cuenta?{" "}
        <Link
          href="/signup"
          className="font-semibold text-[#6251DA] hover:underline"
        >
          Creá la tuya
        </Link>
      </p>

      <p className="mt-6 text-center text-xs leading-5 text-[#A09CAC]">
        Al ingresar confirmás que aceptás los términos de uso de Flikker.
      </p>
    </AuthSplitShell>
  );
}
