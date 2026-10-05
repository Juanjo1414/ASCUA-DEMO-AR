import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@menu-ar/db';

// Cliente de servidor con sesión de cookies y anon key, para Server
// Components y Route Handlers de `/admin` y `/api`. A diferencia de
// `server-client.ts` (service role, sin sesión, solo para el menú
// público), este respeta RLS: cada dueño solo ve y toca lo suyo.
export async function createServerSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      '[WEB_SUPABASE_SESSION_CLIENT_MISSING_ENV] Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.'
    );
  }

  const cookieStore = await cookies();

  return createSupabaseServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Llamado desde un Server Component: las cookies son de solo
          // lectura ahí. El middleware ya refresca la sesión en cada
          // request, así que esto es seguro de ignorar.
        }
      },
    },
  });
}
