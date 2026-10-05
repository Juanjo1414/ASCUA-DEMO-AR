import { redirect } from 'next/navigation';

// /admin es lo que uno teclea de memoria, pero el panel no tenía nada ahí
// y devolvía un 404 sin pistas. Manda al menú, que es la pantalla de
// trabajo; si no hay sesión, el middleware la desvía al login igual.
export default function AdminIndexPage() {
  redirect('/admin/menu');
}
