import ThemeToggle from '@/components/theme/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[color:var(--background)]">
      <div className="absolute right-4 top-4 z-10 md:right-6 md:top-6">
        <ThemeToggle />
      </div>

      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        {children}
      </div>
    </div>
  );
}
