import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import type { Database } from '@menu-ar/db';

// Cliente de navegador con anon key. Lo usa el panel (`app/admin`) para
// Auth por magic link; @supabase/ssr sincroniza la sesión con las
// cookies que lee el middleware (Fase 4). RLS decide qué ve cada dueño.
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      '[WEB_SUPABASE_BROWSER_CLIENT_MISSING_ENV] Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.'
    );
  }

  return createSupabaseBrowserClient<Database>(url, anonKey);
}
