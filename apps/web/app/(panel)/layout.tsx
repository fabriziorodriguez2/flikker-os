import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Sidebar from './sidebar';
import LogoutButton from './logout-button';
import SelectBusiness from './select-business';
import { RoleProvider } from './role-context';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { user, memberships, activeBusinessId } = session;

  // If no business selected and user has multiple, show selector
  if (!activeBusinessId) {
    return (
      <SelectBusiness
        memberships={memberships}
        userName={user.firstName}
      />
    );
  }

  const currentRole = memberships.find((m) => m.businessId === activeBusinessId)?.role ?? null;

  return (
    <div className="min-h-screen flex bg-zinc-50">
      <Sidebar
        memberships={memberships}
        activeBusinessId={activeBusinessId}
        userName={`${user.firstName} ${user.lastName}`}
        isPlatformAdmin={user.isPlatformAdmin}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-zinc-200 px-6 py-3 flex items-center justify-end gap-4">
          <span className="text-sm text-zinc-500">
            {user.firstName} {user.lastName}
          </span>
          <LogoutButton />
        </header>

        <main className="flex-1 px-6 py-6 overflow-auto">
          <RoleProvider role={currentRole}>
            {children}
          </RoleProvider>
        </main>
      </div>
    </div>
  );
}
