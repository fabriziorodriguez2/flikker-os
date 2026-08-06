"use client";

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  Suspense,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, Sparkles } from "lucide-react";

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

  function handleVisualPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;

    event.currentTarget.style.setProperty("--login-shift-x", `${x * 24}px`);
    event.currentTarget.style.setProperty("--login-shift-y", `${y * 24}px`);
    event.currentTarget.style.setProperty(
      "--login-shift-x-reverse",
      `${x * -18}px`,
    );
    event.currentTarget.style.setProperty(
      "--login-shift-y-reverse",
      `${y * -18}px`,
    );
  }

  function resetVisualPosition(event: ReactPointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty("--login-shift-x", "0px");
    event.currentTarget.style.setProperty("--login-shift-y", "0px");
    event.currentTarget.style.setProperty("--login-shift-x-reverse", "0px");
    event.currentTarget.style.setProperty("--login-shift-y-reverse", "0px");
  }

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F2F1FF] px-4 py-6 sm:px-8 sm:py-10">
      <div
        aria-hidden="true"
        className="absolute -left-24 top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-[#C6F2FF]/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-64 right-[-8rem] h-[38rem] w-[38rem] rounded-full bg-[#D7C5FF]/55 blur-3xl"
      />

      <section className="relative grid w-full max-w-[1060px] overflow-hidden rounded-[30px] border border-white/80 bg-white p-2.5 shadow-[0_28px_80px_rgba(63,52,146,0.20)] lg:grid-cols-[0.92fr_1.08fr]">
        <aside
          onPointerMove={handleVisualPointerMove}
          onPointerLeave={resetVisualPosition}
          className="relative hidden min-h-[650px] overflow-hidden rounded-[22px] bg-[#3320B8] p-9 text-white lg:flex lg:flex-col lg:justify-between"
        >
          <div
            aria-hidden="true"
            className="absolute -inset-8 bg-[radial-gradient(circle_at_8%_3%,rgba(181,243,255,0.95),transparent_32%),radial-gradient(circle_at_93%_10%,rgba(225,158,255,0.92),transparent_34%),radial-gradient(circle_at_85%_82%,rgba(161,221,255,0.86),transparent_32%),linear-gradient(145deg,#7168ff_0%,#2c12a8_47%,#160671_72%,#9a8cff_100%)] transition-transform duration-300 ease-out will-change-transform"
            style={{
              transform:
                "translate3d(var(--login-shift-x, 0px), var(--login-shift-y, 0px), 0) scale(1.08)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute -left-28 top-40 h-64 w-64 rounded-full bg-[#24106F] blur-[44px] transition-transform duration-500 ease-out will-change-transform"
            style={{
              transform:
                "translate3d(var(--login-shift-x-reverse, 0px), var(--login-shift-y-reverse, 0px), 0)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute right-[-7rem] top-48 h-80 w-80 rounded-full bg-[#CBF6FF]/80 blur-[55px] transition-transform duration-500 ease-out will-change-transform"
            style={{
              transform:
                "translate3d(var(--login-shift-x, 0px), var(--login-shift-y, 0px), 0)",
            }}
          />

          <div className="relative flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/flikker-mark-white.svg" alt="" className="h-9 w-9" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/flikker-wordmark-white.svg"
              alt="Flikker"
              className="h-5 w-auto"
            />
          </div>

          <div className="relative max-w-[390px] pb-3">
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/15 backdrop-blur-md">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="mb-3 text-sm font-semibold text-white/75">
              Todo tu negocio, más claro
            </p>
            <h1 className="text-[38px] font-bold leading-[1.08] tracking-[-0.045em] text-white">
              Convertí cada visita en una relación que vuelve.
            </h1>
            <p className="mt-5 max-w-[340px] text-[15px] leading-6 text-white/72">
              Reputación, clientes y campañas en un solo lugar, para que puedas
              enfocarte en hacer crecer tu negocio.
            </p>
          </div>
        </aside>

        <div className="flex min-h-[580px] items-center px-5 py-10 sm:px-12 lg:min-h-[650px] lg:px-16 xl:px-20">
          <div className="mx-auto w-full max-w-[410px]">
            <div className="mb-9 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/flikker-logotype.svg"
                alt="Flikker"
                className="h-auto w-[78px]"
              />
            </div>

            <div className="mb-8">
              <div className="mb-5 hidden h-9 w-9 items-center justify-center rounded-xl bg-[#EEEAFE] text-[#5B43E8] lg:flex">
                <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
              </div>
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

            <p className="mt-8 text-center text-xs leading-5 text-[#A09CAC]">
              Al ingresar confirmás que aceptás los términos de uso de Flikker.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
