import { getSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { redirect } from 'next/navigation';

interface Business {
  id: string;
  name: string;
  slug: string;
  status: string;
  industry: string | null;
  email: string | null;
  phone: string | null;
}

interface Branch {
  id: string;
  name: string;
  isActive: boolean;
}

interface Member {
  id: string;
  role: string;
  status: string;
  user: { firstName: string; lastName: string; email: string };
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect('/dashboard');

  const { accessToken, activeBusinessId } = session;

  let business: Business | null = null;
  let branches: Branch[] = [];
  let members: Member[] = [];
  let error: string | null = null;

  try {
    [business, branches, members] = await Promise.all([
      apiFetch<Business>('/businesses/current', accessToken, {
        businessId: activeBusinessId,
      }),
      apiFetch<Branch[]>('/branches', accessToken, {
        businessId: activeBusinessId,
      }),
      apiFetch<Member[]>('/memberships', accessToken, {
        businessId: activeBusinessId,
      }),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar datos';
  }

  if (error) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold text-zinc-900">Panel operativo</h1>
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  const activeBranches = branches.filter((b) => b.isActive).length;
  const activeMembers = members.filter((m) => m.status === 'ACTIVE').length;
  const currentRole = session.memberships.find(
    (m) => m.businessId === activeBusinessId,
  )?.role;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{business?.name}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {business?.industry ?? 'Sin industria'} · {business?.status}
          </p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-600 font-medium">
          {currentRole}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-500">Sucursales activas</p>
          <p className="text-2xl font-semibold text-zinc-900 mt-1">{activeBranches}</p>
          <p className="text-xs text-zinc-400 mt-1">{branches.length} total</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-500">Miembros activos</p>
          <p className="text-2xl font-semibold text-zinc-900 mt-1">{activeMembers}</p>
          <p className="text-xs text-zinc-400 mt-1">{members.length} total</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-500">Estado</p>
          <p className="text-2xl font-semibold text-zinc-900 mt-1">{business?.status}</p>
          <p className="text-xs text-zinc-400 mt-1">{business?.slug}</p>
        </div>
      </div>

      {business?.email && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-700">Contacto</p>
          <p className="text-sm text-zinc-500 mt-1">{business.email}</p>
          {business.phone && (
            <p className="text-sm text-zinc-500">{business.phone}</p>
          )}
        </div>
      )}
    </div>
  );
}
