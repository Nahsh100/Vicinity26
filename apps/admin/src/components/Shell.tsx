'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, type ReactNode } from 'react';
import { useAdmin } from '@/lib/client';

interface Session {
  userId: string;
  email: string;
  permissions: string[];
  isAdmin: boolean;
}

const SessionCtx = createContext<Session | null>(null);
export const useSession = () => useContext(SessionCtx);
export const can = (s: Session | null, p: string) => !!s && (s.permissions.includes('*') || s.permissions.includes(p));

const NAV: { href: string; label: string; perm: string; icon: string }[] = [
  { href: '/', label: 'Dashboard', perm: 'dashboard.view', icon: '▦' },
  { href: '/reports', label: 'Reports', perm: 'reports.view', icon: '⚑' },
  { href: '/users', label: 'Users', perm: 'users.view', icon: '👤' },
  { href: '/providers', label: 'Providers', perm: 'providers.view', icon: '🏪' },
  { href: '/listings', label: 'Listings', perm: 'listings.view', icon: '🏷' },
  { href: '/categories', label: 'Categories', perm: 'categories.manage', icon: '☰' },
  { href: '/organizations', label: 'Organizations', perm: 'organizations.view', icon: '👥' },
  { href: '/notifications', label: 'Notifications', perm: 'notifications.send', icon: '🔔' },
  { href: '/monetization', label: 'Plans & promotions', perm: 'monetization.manage', icon: '★' },
  { href: '/audit', label: 'Audit log', perm: 'audit.view', icon: '⎙' },
];

/** Navigation is shaped by the admin's permissions from the API; the API still checks every request. */
export function Shell({ children }: { children: ReactNode }) {
  const session = useAdmin<Session>('admin/session');
  const path = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch('/api/session', { method: 'DELETE', headers: { 'x-vicinity-admin': '1' } });
    router.replace('/login');
  };

  if (session.loading) return <div className="p-10 text-sm text-muted">Loading…</div>;
  if (session.error || !session.data?.isAdmin) {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-card bg-white p-8 text-center shadow">
        <p className="mb-4 text-sm text-muted">{session.error?.status === 401 ? 'Your session has ended.' : 'This account does not have administrator access.'}</p>
        <button className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white" onClick={() => router.replace('/login')}>Sign in</button>
      </div>
    );
  }
  const s = session.data;

  return (
    <SessionCtx.Provider value={s}>
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white p-4 md:flex">
          <div className="mb-6 flex items-center gap-2 px-2">
            <img src="/brand/vicinity-symbol-small-light.svg" alt="" width={34} height={34} />
            <div>
              <p className="font-bold tracking-[0.18em] text-[#06332E]">VICINITY</p>
              <p className="text-[11px] text-muted">Administration</p>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.filter((n) => can(s, n.perm)).map((n) => {
              const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${active ? 'bg-primary-soft text-primary-dark' : 'text-muted hover:bg-surface-low'}`}>
                  <span aria-hidden className="w-5 text-center">{n.icon}</span>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-line pt-3 text-xs text-muted">
            <p className="truncate">{s.email}</p>
            <button onClick={() => void logout()} className="mt-2 font-semibold text-primary-dark">Sign out</button>
          </div>
        </aside>
        <main className="flex-1 overflow-x-hidden p-6 md:p-8">
          <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
            {NAV.filter((n) => can(s, n.perm)).map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-muted">{n.label}</Link>
            ))}
          </div>
          {children}
        </main>
      </div>
    </SessionCtx.Provider>
  );
}
