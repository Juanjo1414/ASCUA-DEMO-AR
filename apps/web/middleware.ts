import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Un año. Sin maxAge explícito quedan como cookies de sesión y el navegador
// las borra al cerrarse: el dueño tendría que pedir un magic link cada vez
// que abre la PWA, que es justo lo que la app instalada evita. El refresh
// token se renueva en cada visita, así que la sesión dura mientras la use.
const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

// Protege todo /admin excepto /admin/login. La verificación real (RLS)
// vive en la base de datos; esto es solo para no mostrar la UI del panel
// a quien no tiene sesión.
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      '[WEB_MIDDLEWARE_MISSING_ENV] Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.'
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, maxAge: SESSION_MAX_AGE })
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginRoute = request.nextUrl.pathname === '/admin/login';

  if (!user && !isLoginRoute) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  if (user && isLoginRoute) {
    return NextResponse.redirect(new URL('/admin/mi-restaurante', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
