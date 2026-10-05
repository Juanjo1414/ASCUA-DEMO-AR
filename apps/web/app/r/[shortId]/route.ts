import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server-client';

// El QR impreso apunta siempre aquí, nunca directo a /m/[slug]: el slug
// puede cambiar, el short_id no. Ver sección 0 del plan.
//
// Quien escanea está sentado en la mesa y espera la web del restaurante
// —horarios, reservas, la carta a un toque—, no una lista de platos suelta.
// Si hay una web configurada, el QR lleva allá; si no, cae en /m/[slug]
// como antes. Los códigos ya impresos no cambian en ninguno de los dos casos.
const SITE_URL = process.env.RESTAURANT_SITE_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shortId: string }> }
) {
  const { shortId } = await params;
  const supabase = createServerClient();

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('slug')
    .eq('short_id', shortId)
    .single();

  if (!restaurant) {
    return new NextResponse('Restaurante no encontrado', { status: 404 });
  }

  if (SITE_URL) {
    // Sólo http(s): una URL con otro esquema convertiría este redirect del
    // servidor en un salto hacia algo ejecutable.
    if (/^https?:\/\//i.test(SITE_URL)) {
      return NextResponse.redirect(SITE_URL, 307);
    }
  }

  return NextResponse.redirect(new URL(`/m/${restaurant.slug}`, request.url), 307);
}
