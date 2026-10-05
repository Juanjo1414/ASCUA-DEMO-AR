'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Languages, LogOut, QrCode, Store, UtensilsCrossed } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/browser-client';
import { ServiceWorkerRegistrar } from '@/components/admin/ServiceWorkerRegistrar';

const NAV = [
  { href: '/admin/menu', label: 'Menú', icon: UtensilsCrossed },
  { href: '/admin/qr', label: 'Mi QR', icon: QrCode },
  { href: '/admin/mi-restaurante', label: 'Restaurante', icon: Store },
  // Idiomas y analítica vienen en todos los planes, así que ya no dependen
  // de consultar el plan antes de mostrar el enlace.
  { href: '/admin/idiomas', label: 'Idiomas', icon: Languages },
  { href: '/admin/analitica', label: 'Analítica', icon: BarChart3 },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === '/admin/login';

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/admin/login');
    router.refresh();
  };

  if (isLoginRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <ServiceWorkerRegistrar />
      <header className="sticky top-0 z-20 border-b border-copper-900/40 bg-charcoal-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-6 px-5">
          <Link
            href="/admin/menu"
            className="font-serif text-lg font-semibold tracking-tight text-cream"
          >
            Ascua
            <span className="ml-2 align-middle text-xs font-normal tracking-normal text-stone">
              panel
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              // El detalle de un plato sigue siendo la sección "Menú".
              const isActive = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-charcoal-800 text-cream'
                      : 'text-stone hover:bg-charcoal-900 hover:text-cream'
                  }`}
                >
                  <Icon size={16} strokeWidth={1.75} className={isActive ? 'text-copper-400' : ''} />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="ml-1 flex items-center gap-2 rounded-full px-3 py-2 text-sm text-stone transition-colors hover:bg-charcoal-900 hover:text-cream"
            >
              <LogOut size={16} strokeWidth={1.75} />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
    </div>
  );
}
