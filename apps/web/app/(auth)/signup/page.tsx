"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail, MailCheck, User } from "lucide-react";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";

const MIN_LENGTH = 8;

/**
 * Alta self-service. Pide exactamente Nombre, Email, Contraseña y su
 * confirmación — nada de negocio: eso se configura en `/comenzar`, una vez
 * confirmado el correo. Al crear la cuenta NO arranca sesión ni redirige:
 * muestra "Revisá tu correo", porque la cuenta todavía no está confirmada.
 *
 * Mismo layout de split-screen que `/login` (aside con gradiente + columna de
 * formulario) — pedido explícito de mantener el diseño consistente entre
 * ambas pantallas de auth.
 */
export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (name.length < 2) {
      setError("Contanos tu nombre.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Ese email no parece válido.");
      return;
    }
    if (password.length < MIN_LENGTH) {
      setError(`La contraseña necesita al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        email?: string;
      };

      if (!response.ok) {
        setError(data.message ?? "No pudimos crear tu cuenta");
        return;
      }

      setSubmittedEmail(data.email ?? email);
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
    <AuthSplitShell>
      {submittedEmail ? (
        <RevisaTuCorreo
          email={submittedEmail}
          onChangeEmail={() => setSubmittedEmail(null)}
        />
      ) : (
        <>
          <div className="mb-8">
            <p className="mb-2 text-sm font-semibold text-[#6D5BE7]">
              Empezá gratis
            </p>
            <h2 className="text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#17142B] sm:text-[36px]">
              Creá tu cuenta
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#7E7A91]">
              En unos minutos vas a tener tu programa de sellos andando, con tu
              QR listo para el mostrador.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className={labelClass}>
                Nombre
              </label>
              <div className={boxClass}>
                <User className="h-[18px] w-[18px] shrink-0 text-[#9B97AA]" />
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  minLength={2}
                  placeholder="Tu nombre"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className={labelClass}>
                Correo electrónico
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
                  minLength={MIN_LENGTH}
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

            <div>
              <label htmlFor="confirmPassword" className={labelClass}>
                Confirmar contraseña
              </label>
              <div className={boxClass}>
                <Lock className="h-[18px] w-[18px] shrink-0 text-[#9B97AA]" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={MIN_LENGTH}
                  placeholder="Repetí tu contraseña"
                  className={inputClass}
                />
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
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#5B43E8] text-sm font-bold text-white shadow-[0_10px_24px_rgba(91,67,232,0.26)] hover:-translate-y-0.5 hover:bg-[#4D35D7] hover:shadow-[0_14px_28px_rgba(91,67,232,0.32)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5B43E8]/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
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
                "Crear cuenta"
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
        </>
      )}
    </AuthSplitShell>
  );
}

function RevisaTuCorreo({
  email,
  onChangeEmail,
}: {
  email: string;
  onChangeEmail: () => void;
}) {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleResend() {
    setResending(true);
    setResent(false);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF0FB]">
        <MailCheck className="h-7 w-7 text-[#5B43E8]" />
      </div>
      <h1 className="mt-6 text-[26px] font-bold leading-tight tracking-[-0.03em] text-[#17142B]">
        Revisá tu correo
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#7E7A91]">
        Te enviamos un enlace para confirmar tu cuenta. Buscalo en{" "}
        <strong className="font-semibold text-[#28243A]">{email}</strong> y
        tocalo para empezar a usar Flikker.
      </p>

      {resent ? (
        <p className="mt-5 rounded-xl border border-[#639922]/20 bg-[#639922]/10 px-4 py-3 text-sm text-[#4C7A1A]">
          Te lo reenviamos. Puede tardar unos minutos en llegar.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleResend()}
        disabled={resending}
        className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#5B43E8] text-sm font-bold text-white shadow-[0_10px_24px_rgba(91,67,232,0.26)] transition-all hover:-translate-y-0.5 hover:bg-[#4D35D7] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {resending ? "Reenviando..." : "Reenviar correo"}
      </button>

      <button
        type="button"
        onClick={onChangeEmail}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold text-[#6251DA] hover:bg-[#F4F2FA]"
      >
        Cambiar correo
      </button>

      <p className="mt-6 text-center text-sm text-[#7E7A91]">
        ¿Ya confirmaste?{" "}
        <Link
          href="/login"
          className="font-semibold text-[#6251DA] hover:underline"
        >
          Ingresá
        </Link>
      </p>
    </div>
  );
}
