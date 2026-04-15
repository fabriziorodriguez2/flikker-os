'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminStatusBadge from '@/components/admin/admin-status-badge';
import MetricCard from '@/components/ui/metric-card';
import PageHeader from '@/components/ui/page-header';
import SectionCard from '@/components/ui/section-card';
import { useCanMutate } from '../../role-context';

interface Branch {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
}

export default function BranchesPage() {
  const canMutate = useCanMutate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/branches?includeInactive=true');
      if (!res.ok) throw new Error('Error al cargar sucursales');
      setBranches(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  function resetForm() {
    setName('');
    setSlug('');
    setAddress('');
    setCity('');
    setState('');
    setPhone('');
    setEmail('');
    setFormError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const body: Record<string, string> = { name, slug };
    if (address) body.address = address;
    if (city) body.city = city;
    if (state) body.state = state;
    if (phone) body.phone = phone;
    if (email) body.email = email;

    try {
      const res = await fetch('/api/proxy/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'Error al crear sucursal');
      }
      resetForm();
      setShowForm(false);
      await fetchBranches();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(branch: Branch) {
    try {
      const res = await fetch(`/api/proxy/branches/${branch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !branch.isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'Error al actualizar');
      }
      await fetchBranches();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-4 w-32 animate-pulse rounded-full bg-[color:var(--surface-subtle)]" />
        <div className="h-12 w-80 animate-pulse rounded-[18px] bg-[color:var(--surface-muted)]" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-32 animate-pulse rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)]" />
          <div className="h-32 animate-pulse rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)]" />
          <div className="h-32 animate-pulse rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)]" />
        </div>
        <div className="h-80 animate-pulse rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)]" />
      </div>
    );
  }

  const activeBranches = branches.filter((branch) => branch.isActive).length;
  const cities = new Set(branches.map((branch) => branch.city).filter(Boolean)).size;
  const branchesWithContact = branches.filter((branch) => branch.phone || branch.email).length;

  const inputClass =
    'mt-2 w-full rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--text-soft)] focus:border-[color:var(--brand-accent)] focus:ring-2 focus:ring-[color:rgba(145,136,245,0.14)]';
  const actionButtonClass =
    'inline-flex items-center rounded-[16px] bg-[color:var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,4,65,0.18)] transition-colors hover:bg-[color:var(--brand-accent)] disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Sucursales"
        title="Sucursales"
        subtitle="Sucursales del negocio activo."
        actions={
          canMutate ? (
            <button
              onClick={() => {
                setShowForm(!showForm);
                resetForm();
              }}
              className={actionButtonClass}
            >
              {showForm ? 'Cancelar' : 'Nueva sucursal'}
            </button>
          ) : null
        }
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <MetricCard label="Sucursales" value={branches.length} tone="accent" hint="Total registradas" />
        <MetricCard label="Activas" value={activeBranches} hint="Disponibles hoy" />
        <MetricCard label="Con contacto" value={branchesWithContact} tone="warm" hint={`${cities} ciudades`} />
      </section>

      {error ? (
        <div className="rounded-[24px] border px-5 py-4 text-sm text-[color:var(--danger-text)]">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <SectionCard
          title="Nueva sucursal"
          description="Carga los datos básicos."
        >
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Nombre
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="Sucursal Centro"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Slug
                </label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="centro"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Dirección
                </label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={inputClass}
                  placeholder="Av. Principal 123"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Ciudad
                </label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputClass}
                  placeholder="Montevideo"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Departamento
                </label>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={inputClass}
                  placeholder="Montevideo"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Teléfono
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder="+598 99 123 456"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="sucursal@negocio.com"
                />
              </div>
            </div>

            {formError ? (
              <p className="rounded-[20px] border px-4 py-3 text-sm text-[color:var(--danger-text)]">
                {formError}
              </p>
            ) : null}

            <button type="submit" disabled={saving} className={actionButtonClass}>
              {saving ? 'Creando...' : 'Crear sucursal'}
            </button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Sucursales registradas"
        description="Listado de sucursales y estado."
      >
        {branches.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-muted)] px-6 py-10 text-center">
            <h3 className="text-2xl font-semibold text-[color:var(--foreground)]">Todavía no hay sucursales</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[color:var(--text-muted)]">
              Cuando agregues una sucursal, va a aparecer acá.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] lg:block">
              <div className="grid grid-cols-[minmax(0,1.3fr)_180px_180px_160px_160px] gap-4 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)] px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                <div>Sucursal</div>
                <div>Slug</div>
                <div>Ciudad</div>
                <div>Estado</div>
                <div className="text-right">Acciones</div>
              </div>

              <div className="divide-y divide-[color:var(--border)]">
                {branches.map((branch) => (
                  <div
                    key={branch.id}
                    className="grid grid-cols-[minmax(0,1.3fr)_180px_180px_160px_160px] gap-4 px-6 py-5 hover:bg-[color:var(--surface-muted)]/55"
                  >
                    <div>
                      <p className="text-base font-semibold text-[color:var(--foreground)]">{branch.name}</p>
                      <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                        {[branch.address, branch.phone || branch.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                      </p>
                    </div>
                    <div className="text-sm text-[color:var(--text-muted)]">{branch.slug}</div>
                    <div className="text-sm text-[color:var(--text-muted)]">{branch.city ?? '-'}</div>
                    <div>
                      <AdminStatusBadge tone={branch.isActive ? 'active' : 'inactive'} label={branch.isActive ? 'Activa' : 'Inactiva'} />
                    </div>
                    <div className="text-right">
                      {canMutate ? (
                        <button
                          onClick={() => toggleActive(branch)}
                          className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]"
                        >
                          {branch.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                      ) : (
                        <span className="text-xs text-[color:var(--text-soft)]">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 lg:hidden">
              {branches.map((branch) => (
                <div key={branch.id} className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-[color:var(--foreground)]">{branch.name}</p>
                      <p className="mt-1 text-sm text-[color:var(--text-muted)]">{branch.slug}</p>
                    </div>
                    <AdminStatusBadge tone={branch.isActive ? 'active' : 'inactive'} label={branch.isActive ? 'Activa' : 'Inactiva'} />
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-[color:var(--text-muted)]">
                    <p>Ciudad: {branch.city ?? '-'}</p>
                    <p>Dirección: {branch.address ?? '-'}</p>
                    <p>Contacto: {branch.phone || branch.email || '-'}</p>
                  </div>

                  {canMutate ? (
                    <button
                      onClick={() => toggleActive(branch)}
                      className="mt-5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-xs font-semibold text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--brand-accent)] hover:text-[color:var(--foreground)]"
                    >
                      {branch.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
