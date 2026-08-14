"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MailWarning } from "lucide-react";

/** La API contesta el mismo mensaje genérico para token inexistente, ya usado o vencido. */
const INVALID_TOKEN_MESSAGE =
  "El enlace no es válido o ya venció. Si ya confirmaste tu cuenta antes, podés ingresar directamente.";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";
  // Sin token no hay nada que intentar: arranca directo en error, sin pasar
  // por "verifying" primero.
  const [status, setStatus] = useState<"verifying" | "error">(
    token ? "verifying" : "error",
  );
  // El link puede montar el componente dos veces (StrictMode) o el usuario
  // puede volver atrás y reenviar: un solo intento real por token.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    void (async () => {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          redirectTo?: string;
        };
        if (!response.ok) {
          setStatus("error");
          return;
        }
        router.push(data.redirectTo ?? "/comenzar");
        router.refresh();
      } catch {
        setStatus("error");
      }
    })();
  }, [token, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F6FA] px-5 py-10">
      <section className="w-full max-w-[420px] rounded-xl border border-[#E8EAF0] bg-white px-8 py-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/flikker-logotype.svg"
          alt="Flikker"
          className="mx-auto h-auto w-[96px]"
        />

        {status === "verifying" ? (
          <div className="mt-8">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#5C6BC0]" />
            <p className="mt-4 text-sm leading-6 text-[#8891A4]">
              Confirmando tu cuenta...
            </p>
          </div>
        ) : (
          <div className="mt-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#C0392B]/10">
              <MailWarning className="h-6 w-6 text-[#C0392B]" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-[#1A202C]">
              No pudimos confirmar tu cuenta
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#8891A4]">
              {INVALID_TOKEN_MESSAGE}
            </p>
            <ResendForm initialEmail={email} />
            <Link
              href="/login"
              className="mt-4 block text-center text-sm font-medium text-[#8891A4] hover:text-[#1A202C]"
            >
              Volver al inicio de sesión
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

function ResendForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleResend() {
    if (!email.trim()) return;
    setSending(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  const inputClass =
    "h-12 w-full rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]";

  if (sent) {
    return (
      <p className="mt-5 rounded-lg border border-[#639922]/20 bg-[#639922]/10 px-4 py-3 text-sm text-[#4C7A1A]">
        Si ese correo existe y no fue confirmado, te reenviamos el enlace.
      </p>
    );
  }

  return (
    <div className="mt-5 space-y-3 text-left">
      <label className="block text-sm font-medium text-[#1A202C]">
        Pedí un enlace nuevo
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@negocio.com"
          className={`mt-2 ${inputClass}`}
        />
      </label>
      <button
        type="button"
        onClick={() => void handleResend()}
        disabled={sending || !email.trim()}
        className="flex h-11 w-full items-center justify-center rounded-lg bg-[#5C6BC0] text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {sending ? "Enviando..." : "Reenviar correo"}
      </button>
    </div>
  );
}
