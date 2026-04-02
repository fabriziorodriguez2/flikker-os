import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LogoutButton from './logout-button';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { user } = session;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-900">Flikker OS</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500">
            {user.firstName} {user.lastName}
          </span>
          <LogoutButton />
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
