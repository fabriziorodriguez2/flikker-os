'use client';

import { useState, useEffect, useCallback } from 'react';
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

  // Form state
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
    return <p className="text-sm text-zinc-500">Cargando sucursales...</p>;
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">Sucursales</h1>
        {canMutate && (
          <button
            onClick={() => { setShowForm(!showForm); resetForm(); }}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
          >
            {showForm ? 'Cancelar' : 'Nueva sucursal'}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-medium text-zinc-900 mb-4">Nueva sucursal</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Nombre *</label>
              <input
                value={name} onChange={(e) => setName(e.target.value)} required
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                placeholder="Sucursal Centro"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Slug *</label>
              <input
                value={slug} onChange={(e) => setSlug(e.target.value)} required
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                placeholder="centro"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Dirección</label>
              <input
                value={address} onChange={(e) => setAddress(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                placeholder="Av. Principal 123"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Ciudad</label>
              <input
                value={city} onChange={(e) => setCity(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                placeholder="Montevideo"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Departamento</label>
              <input
                value={state} onChange={(e) => setState(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                placeholder="Montevideo"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Teléfono</label>
              <input
                value={phone} onChange={(e) => setPhone(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                placeholder="+598 99 123 456"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-medium text-zinc-600">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                placeholder="sucursal@negocio.com"
              />
            </div>
          </div>

          {formError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <button
            type="submit" disabled={saving}
            className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Creando...' : 'Crear sucursal'}
          </button>
        </form>
      )}

      {/* Table */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {branches.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">No hay sucursales creadas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Nombre</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Slug</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Ciudad</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Estado</th>
                <th className="text-right px-4 py-2.5 font-medium text-zinc-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3 text-zinc-900">{b.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{b.slug}</td>
                  <td className="px-4 py-3 text-zinc-500">{b.city ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      b.isActive
                        ? 'bg-green-50 text-green-700'
                        : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {b.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canMutate && (
                      <button
                        onClick={() => toggleActive(b)}
                        className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
                      >
                        {b.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
