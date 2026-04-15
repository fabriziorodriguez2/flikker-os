'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import BrandLogo from '@/components/brand/brand-logo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? 'Error al iniciar sesión');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[420px]">
      <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-7 shadow-[var(--shadow-card)] sm:px-8 sm:py-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo
            priority
            width={182}
            height={155}
            className="h-auto w-[150px] sm:w-[182px]"
          />
          <h1 className="mt-5 text-2xl font-semibold text-[color:var(--foreground)]">
            Iniciar sesión
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="email"
              className="text-sm font-medium text-[color:var(--foreground)]"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flikker-input flikker-focus-ring px-4 py-3 text-sm"
              placeholder="tu@email.com"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-[color:var(--foreground)]"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flikker-input flikker-focus-ring px-4 py-3 text-sm"
              placeholder="********"
            />
          </div>

          {error ? (
            <p
              className="rounded-[16px] border px-4 py-3 text-sm text-[color:var(--danger-text)]"
              style={{
                backgroundColor: 'var(--danger-bg)',
                borderColor: 'rgba(161,45,58,0.16)',
              }}
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[16px] bg-[color:var(--brand-primary)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--brand-accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
