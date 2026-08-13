"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, Store } from "lucide-react";

/**
 * Alta self-service. Pide lo mínimo para tener cuenta; todo lo demás (rubro,
 * logo, programa, tarjeta) se configura en `/comenzar`, que es adonde va este
 * formulario al terminar.
 */
export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
          businessName: String(formData.get("businessName") ?? ""),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        setError(data.message ?? "No pudimos crear tu cuenta");
        return;
      }

      router.push(data.redirectTo ?? "/comenzar");
      router.refresh();
    } catch {
      setError("No pudimos conectar con el servidor. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const boxClass =
    "flex h-[52px] items-center rounded-xl border border-[#DEDCE8] bg-white px-3.5 focus-within:border-[#7362E8] focus-within:shadow-[0_0_0_4px_rgba(115,98,232,0.10)]";
  const inputClass =
    "login-clean-input min-w-0 flex-1 bg-transparent px-3 text-sm text-[#211D34] outline-none placeholder:text-[#AAA6B8]";
  const labelClass = "mb-2 block text-sm font-semibold text-[#28243A]";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F2F1FF] px-4 py-10">
      <div
        aria-hidden="true"
        className="absolute -left-24 top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-[#C6F2FF]/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-64 right-[-8rem] h-[38rem] w-[38rem] rounded-full bg-[#D7C5FF]/55 blur-3xl"
      />

      <section className="relative w-full max-w-[460px] rounded-[26px] border border-white/80 bg-white px-6 py-10 shadow-[0_28px_80px_rgba(63,52,146,0.18)] sm:px-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/flikker-logotype.svg"
          alt="Flikker"
          className="h-auto w-[78px]"
        />

        <h1 className="mt-8 text-[30px] font-bold leading-tight tracking-[-0.04em] text-[#17142B]">
          Creá tu cuenta
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#7E7A91]">
          En unos minutos vas a tener tu programa de sellos andando, con tu QR
          listo para el mostrador.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="businessName" className={labelClass}>
              Nombre del negocio
            </label>
            <div className={boxClass}>
              <Store className="h-[18px] w-[18px] shrink-0 text-[#9B97AA]" />
              <input
                id="businessName"
                name="businessName"
                type="text"
                required
                minLength={2}
                placeholder="Panadería La Stampa"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <div className={boxClass}>
              <Mail className="h-[18px] w-[18px] shrink-0 text-[#9B97AA]" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="tu@negocio.com"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className={labelClass}>
              Contraseña
            </label>
            <div className={boxClass}>
              <Lock className="h-[18px] w-[18px] shrink-0 text-[#9B97AA]" />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="Al menos 8 caracteres"
                className={inputClass}
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
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#5B43E8] text-sm font-bold text-white shadow-[0_10px_24px_rgba(91,67,232,0.26)] transition-all hover:-translate-y-0.5 hover:bg-[#4D35D7] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5B43E8]/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {loading ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                />
                <span>Creando tu cuenta...</span>
              </>
            ) : (
              "Empezar"
            )}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-[#7E7A91]">
          ¿Ya tenés cuenta?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#6251DA] hover:underline"
          >
            Ingresá
          </Link>
        </p>
      </section>
    </main>
  );
}
