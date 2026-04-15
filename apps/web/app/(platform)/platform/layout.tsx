import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import SessionExpiryHandler from '@/components/auth/session-expiry-handler';

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.user.isPlatformAdmin) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-zinc-50">
      <SessionExpiryHandler />
      <header className="bg-white border-b border-zinc-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-zinc-900">
            Flikker Platform
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            Ir al panel
          </Link>
          <span className="text-sm text-zinc-500">
            {session.user.firstName} {session.user.lastName}
          </span>
        </div>
      </header>
      <main className="px-6 py-6">{children}</main>
    </div>
  );
}
