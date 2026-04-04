'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCanMutate } from '../../role-context';

interface Member {
  id: string;
  role: string;
  status: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

const ROLES = ['OWNER', 'ADMIN', 'OPERATOR', 'VIEWER'];

export default function MembersPage() {
  const canMutate = useCanMutate();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OPERATOR');

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/memberships');
      if (!res.ok) throw new Error('Error al cargar miembros');
      setMembers(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/proxy/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'Error al agregar miembro');
      }
      setEmail('');
      setRole('OPERATOR');
      setShowForm(false);
      setMessage('Miembro agregado');
      await fetchMembers();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangeRole(membershipId: string, newRole: string) {
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/memberships/${membershipId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'Error al cambiar rol');
      }
      setMessage('Rol actualizado');
      await fetchMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function handleRevoke(membershipId: string) {
    setMessage(null);
    if (!confirm('¿Revocar acceso a este miembro?')) return;

    try {
      const res = await fetch(`/api/proxy/memberships/${membershipId}/revoke`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? 'Error al revocar');
      }
      setMessage('Miembro revocado');
      await fetchMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Cargando equipo...</p>;
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">Equipo</h1>
        {canMutate && (
          <button
            onClick={() => { setShowForm(!showForm); setFormError(null); setEmail(''); setRole('OPERATOR'); }}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
          >
            {showForm ? 'Cancelar' : 'Agregar miembro'}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {message && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-700">{message}</p>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-medium text-zinc-900 mb-4">Agregar miembro</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Email *</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                placeholder="usuario@email.com"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Rol *</label>
              <select
                value={role} onChange={(e) => setRole(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
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
            {saving ? 'Agregando...' : 'Agregar'}
          </button>
        </form>
      )}

      {/* Table */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {members.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">No hay miembros en este negocio.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Nombre</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Rol</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Estado</th>
                <th className="text-right px-4 py-2.5 font-medium text-zinc-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3 text-zinc-900">
                    {m.user.firstName} {m.user.lastName}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{m.user.email}</td>
                  <td className="px-4 py-3">
                    {canMutate ? (
                      <select
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.id, e.target.value)}
                        className="text-xs border border-zinc-200 rounded px-2 py-1 outline-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-zinc-500">{m.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      m.status === 'ACTIVE'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    }`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canMutate && m.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleRevoke(m.id)}
                        className="text-xs text-red-600 hover:text-red-800 transition-colors"
                      >
                        Revocar
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
