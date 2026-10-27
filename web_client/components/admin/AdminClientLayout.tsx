'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FileText, Images, LayoutDashboard, LogOut, MessageSquareQuote, ShieldAlert, ShieldCheck, Tag } from 'lucide-react';

import { ScallopedPageTransition } from '@/components/ui/ScallopedPageTransition';
import { useAdminMe } from '@/hooks/admin/use-admin';
import { useAuth } from '@/hooks/useAuth';
import { AdminApiError } from '@/lib/admin/admin-api';
import { confirmLeave } from '@/lib/admin/unsaved-guard';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/quotes', label: 'Preventivi', icon: FileText, exact: false },
  { href: '/admin/price-book', label: 'Listino', icon: Tag, exact: false },
  { href: '/admin/portfolio', label: 'Portfolio', icon: Images, exact: false },
  { href: '/admin/testimonials', label: 'Recensioni', icon: MessageSquareQuote, exact: false },
  { href: '/admin/gdpr', label: 'GDPR', icon: ShieldCheck, exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Admin console shell (Phase 128).
 *
 * The proxy already redirected visitors without an (unverified) admin claim;
 * this gate asks the BACKEND (`GET /api/admin/me`, Firebase-verified token +
 * App Check) before rendering anything. Data never comes from here: each page
 * calls /api/admin routes that enforce the role again.
 */
export function AdminClientLayout({ children }: { children: React.ReactNode }) {
  const { user, isInitialized, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const me = useAdminMe();

  useEffect(() => {
    if (isInitialized && !user) router.replace('/');
  }, [isInitialized, user, router]);

  if (!isInitialized || !user || me.isPending) {
    return <ScallopedPageTransition isNavigating />;
  }

  if (me.isError) {
    const denied = me.error instanceof AdminApiError && me.error.isAccessDenied;
    return (
      <main
        data-testid="admin-access-denied"
        className="min-h-screen flex items-center justify-center p-6 bg-luxury-bg text-luxury-text"
      >
        <div className="max-w-md text-center space-y-4 glass-premium rounded-2xl p-8 border border-luxury-gold/15">
          <ShieldAlert className="w-10 h-10 mx-auto text-luxury-gold" aria-hidden />
          <h1 className="text-xl font-semibold">{denied ? 'Accesso riservato' : 'Console non raggiungibile'}</h1>
          <p className="text-sm text-luxury-text/70">
            {denied
              ? "Questa area è riservata agli amministratori. Se il ruolo ti è stato assegnato da poco, esci e accedi di nuovo."
              : 'Il server non ha risposto. Riprova tra qualche istante.'}
          </p>
          <Link href="/" className="inline-block text-sm text-luxury-gold hover:underline">
            Torna al sito
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-luxury-bg text-luxury-text">
      <header className="sticky top-0 z-30 border-b border-luxury-gold/10 bg-luxury-bg/95">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center gap-4">
          <Link
            href="/admin"
            onClick={(event) => {
              if (!confirmLeave()) event.preventDefault();
            }}
            className="font-semibold tracking-tight"
          >
            SYD <span className="text-luxury-gold">Console</span>
          </Link>
          <nav aria-label="Sezioni della console" className="flex items-center gap-1 text-sm overflow-x-auto">
            {NAV.map(({ href, label, icon: Icon, exact }) => {
              const active = isActive(pathname, href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={(event) => {
                    if (!confirmLeave()) event.preventDefault();
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap',
                    active ? 'bg-luxury-gold/15 text-luxury-gold' : 'hover:bg-white/5',
                  )}
                >
                  <Icon className="w-4 h-4" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-luxury-text/60" data-testid="admin-email">
              {me.data.email}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden />
              Esci
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">{children}</main>
    </div>
  );
}
