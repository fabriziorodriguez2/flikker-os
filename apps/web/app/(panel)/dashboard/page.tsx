import { getSession } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Panel operativo</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Bienvenido, {session?.user.firstName}. El panel está en construcción.
      </p>

      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-700">Sesión activa</p>
        <p className="mt-1 text-sm text-zinc-500">{session?.user.email}</p>
      </div>
    </div>
  );
}
