import { createClient } from '@supabase/supabase-js';
import type { Database } from '@menu-ar/db';

// Cliente de servidor con service role. Lo usa el menú público
// (`app/m/[slug]`) para leer en build/ISR con privilegios elevados.
// Sin sesión de usuario ni cookies: nunca se expone al navegador.
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      '[WEB_SUPABASE_SERVER_CLIENT_MISSING_ENV] Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.'
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
