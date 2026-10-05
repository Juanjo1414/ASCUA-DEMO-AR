// Fase 1 — crea un restaurante demo con 2 categorías y 6 platos.
// Corre con la service role key porque RLS bloquea al anon key para insertar.
// Uso: pnpm --filter db seed

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    '[SEED_MISSING_ENV] Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.'
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function seed() {
  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .insert({
      short_id: 'demo01',
      slug: 'la-fonda-demo',
      name: 'La Fonda Demo',
      brand_color: '#8B2E2E',
      currency: 'COP',
      is_published: true,
    })
    .select()
    .single();

  if (restaurantError || !restaurant) {
    console.error('[SEED_CREATE_RESTAURANT_FAILED]');
    throw restaurantError ?? new Error('No se pudo crear el restaurante demo.');
  }

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .insert([
      { restaurant_id: restaurant.id, name: 'Entradas', position: 0 },
      { restaurant_id: restaurant.id, name: 'Platos fuertes', position: 1 },
    ])
    .select();

  if (categoriesError || !categories) {
    console.error('[SEED_CREATE_CATEGORIES_FAILED]');
    throw categoriesError ?? new Error('No se pudieron crear las categorías demo.');
  }

  const [entradas, platosFuertes] = categories;

  const { error: dishesError } = await supabase.from('dishes').insert([
    {
      restaurant_id: restaurant.id,
      category_id: entradas.id,
      name: 'Patacón con hogao',
      description: 'Plátano verde frito, hogao casero y queso costeño.',
      price_cents: 1500000,
      position: 0,
    },
    {
      restaurant_id: restaurant.id,
      category_id: entradas.id,
      name: 'Empanadas de pipián',
      description: 'Tres unidades con ají de maní.',
      price_cents: 1200000,
      position: 1,
    },
    {
      restaurant_id: restaurant.id,
      category_id: entradas.id,
      name: 'Arepa de choclo con queso',
      description: 'Arepa dulce de choclo asada, queso campesino derretido.',
      price_cents: 1300000,
      position: 2,
    },
    {
      restaurant_id: restaurant.id,
      category_id: platosFuertes.id,
      name: 'Ajiaco santafereño',
      description: 'Pollo, tres papas, guascas, alcaparras, aguacate y crema de leche.',
      price_cents: 3200000,
      position: 0,
    },
    {
      restaurant_id: restaurant.id,
      category_id: platosFuertes.id,
      name: 'Bandeja paisa',
      description: 'Frijoles, arroz, carne molida, chicharrón, chorizo, huevo y arepa.',
      price_cents: 3800000,
      position: 1,
    },
    {
      restaurant_id: restaurant.id,
      category_id: platosFuertes.id,
      name: 'Sancocho de gallina',
      description: 'Gallina criolla, yuca, plátano y mazorca, servido con arroz.',
      price_cents: 3400000,
      position: 2,
    },
  ]);

  if (dishesError) {
    console.error('[SEED_CREATE_DISHES_FAILED]');
    throw dishesError;
  }

  console.log(`Restaurante demo creado: ${restaurant.slug} (${restaurant.id})`);
  console.log('2 categorías y 6 platos insertados.');
}

seed().catch((error) => {
  console.error('Error al ejecutar el seed:', error);
  process.exit(1);
});
