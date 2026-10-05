import { NextResponse, type NextRequest } from 'next/server';
import { createServerSessionClient } from '@/lib/supabase/server-session-client';

// Aterrizaje del magic link. Sin esta ruta el enlace del correo llegaba
// directo a /admin/mi-restaurante con el código en la query, nadie lo
// canjeaba por sesión, y el middleware devolvía al login: el enlace
// "funcionaba" pero dejaba al dueño en la misma pantalla de entrada.
//
// Supabase manda el código de dos formas según cómo se generó el enlace:
// `?code=` (PKCE, que es lo que usa signInWithOtp desde el navegador) y
// `?token_hash=&type=` (enlaces generados del lado del servidor). Se
// soportan las dos para que sirva tanto el login como el registro.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // El destino se arma con el Host de la petición, no con
  // `request.nextUrl.origin`: cuando el servidor escucha en 0.0.0.0 ese
  // origin sale como "http://0.0.0.0:3000", que no es una dirección
  // navegable, y el navegador muere con ERR_ADDRESS_INVALID. Detrás de un
  // proxy (Vercel) pasa lo mismo con el host interno.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost ?? request.headers.get('host');
  const proto =
    request.headers.get('x-forwarded-proto') ??
    (host?.startsWith('localhost') || host?.startsWith('127.') ? 'http' : 'https');
  const origin = host ? `${proto}://${host}` : request.nextUrl.origin;

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  // `next` solo se acepta como ruta interna: si viniera una URL absoluta
  // desde afuera, esto sería un redirect abierto.
  const requestedNext = searchParams.get('next');
  const next =
    requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/admin/menu';

  const supabase = await createServerSessionClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    console.error('[AUTH_CALLBACK_EXCHANGE_FAILED]', error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'magiclink' | 'email' | 'recovery' | 'invite',
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    console.error('[AUTH_CALLBACK_VERIFY_FAILED]', error.message);
  }

  // Un enlace vencido o ya usado cae acá: se vuelve al login con el motivo
  // a la vista, en vez de dejar al dueño en un bucle sin explicación.
  return NextResponse.redirect(new URL('/admin/login?error=link', origin));
}
