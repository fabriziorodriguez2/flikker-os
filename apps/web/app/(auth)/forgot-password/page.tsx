"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";

type Step = "form" | "sent";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendInstructions(nextEmail: string) {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: nextEmail }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    if (!response.ok) {
      throw new Error(data.message ?? "No pudimos enviar el email.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextEmail = String(formData.get("email") ?? "").trim();

    if (!nextEmail || loading) return;
    setEmail(nextEmail);
    setError(null);
    setLoading(true);
    try {
      await sendInstructions(nextEmail);
      setStep("sent");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos enviar el email.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email || loading) return;
    setError(null);
    setLoading(true);
    try {
      await sendInstructions(email);
      setResent(true);
      window.setTimeout(() => setResent(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos reenviar el email.",
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

        {step === "form"  (
          <form onSubmit={handleSubmit}>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[#1A202C]">
                Recuperá tu contraseña
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#8891A4]">
                Ingresá el email asociado a tu cuenta y te enviamos un link para
                crear una nueva.
              </p>
            </div>

            <div className="mt-6">
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-[#1A202C]"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="vos@negocio.com.uy"
                className="h-12 w-full rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
              />
            </div>

            {error ? <ErrorMessage message={error} /> : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-lg bg-[#5C6BC0] text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Enviando..." : "Enviar instrucciones"}
            </button>

            <BackToLoginLink />
          </form>
        ) : (
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#5C6BC0]/10 text-[#5C6BC0]">
              <Mail className="h-12 w-12" aria-hidden="true" />
            </div>
            <h1 className="mt-6 text-2xl font-bold leading-tight text-[#1A202C]">
              Revisá tu bandeja de entrada
            </h1>
            <p className="mt-4 text-sm leading-6 text-[#8891A4]">
              Te mandamos las instrucciones a{" "}
              <span className="font-semibold text-[#1A202C]">{email}</span>. El
              link vence en 30 minutos.
            </p>

            {error ? <ErrorMessage message={error} /> : null}

            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={loading}
              className="mt-6 flex h-12 w-full items-center justify-center rounded-lg border border-[#E8EAF0] bg-white text-sm font-semibold text-[#1A202C] hover:border-[#5C6BC0] hover:text-[#5C6BC0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {resent  "Enviado ✓" : loading  "Enviando..." : "¿No llegó Reenviar"}
            </button>

            <BackToLoginLink />
          </div>
        )}
      </section>
    </main>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
      {message}
    </div>
  );
}

function BackToLoginLink() {
  return (
    <div className="mt-6 text-center">
      <Link
        href="/login"
        className="text-sm font-medium text-[#5C6BC0] hover:underline"
      >
        ← Volver al inicio de sesión
      </Link>
    </div>
  );
}
