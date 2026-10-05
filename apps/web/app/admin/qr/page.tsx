import { redirect } from 'next/navigation';
import { createServerSessionClient } from '@/lib/supabase/server-session-client';
import { QrDownload } from '@/components/admin/QrDownload';

export default async function AdminQrPage() {
  const supabase = await createServerSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('slug, short_id')
    .eq('owner_id', user.id)
    .maybeSingle();

  // Sin restaurante todavía no hay short_id para el QR — primero arma
  // "Mi restaurante" (Fase 4).
  if (!restaurant) {
    redirect('/admin/mi-restaurante');
  }

  return <QrDownload slug={restaurant.slug} shortId={restaurant.short_id} />;
}
