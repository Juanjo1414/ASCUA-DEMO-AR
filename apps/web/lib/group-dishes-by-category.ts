import type { Database } from '@menu-ar/db';

type Dish = Database['public']['Tables']['dishes']['Row'];

// Extraído de app/m/[slug]/page.tsx para poder testearlo sin renderizar
// la página completa (que necesita un cliente de Supabase real).
export function groupDishesByCategory(dishes: Dish[]): Map<string, Dish[]> {
  const dishesByCategory = new Map<string, Dish[]>();

  for (const dish of dishes) {
    if (!dish.category_id) continue;
    const dishesInCategory = dishesByCategory.get(dish.category_id) ?? [];
    dishesInCategory.push(dish);
    dishesByCategory.set(dish.category_id, dishesInCategory);
  }

  return dishesByCategory;
}
