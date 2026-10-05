import { describe, expect, it } from 'vitest';
import { groupDishesByCategory } from './group-dishes-by-category';
import type { Database } from '@menu-ar/db';

type Dish = Database['public']['Tables']['dishes']['Row'];

function makeDish(overrides: Partial<Dish>): Dish {
  return {
    id: 'dish-id',
    restaurant_id: 'restaurant-id',
    category_id: null,
    name: 'Plato',
    description: null,
    price_cents: 0,
    photo_url: null,
    position: 0,
    is_available: true,
    agotado_hasta: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('groupDishesByCategory', () => {
  it('agrupa los platos por category_id', () => {
    const entradas = makeDish({ id: '1', category_id: 'cat-entradas', name: 'Patacón' });
    const fuertes = makeDish({ id: '2', category_id: 'cat-fuertes', name: 'Ajiaco' });

    const result = groupDishesByCategory([entradas, fuertes]);

    expect(result.get('cat-entradas')).toEqual([entradas]);
    expect(result.get('cat-fuertes')).toEqual([fuertes]);
  });

  it('mantiene el orden de llegada dentro de cada categoría', () => {
    const first = makeDish({ id: '1', category_id: 'cat', position: 0, name: 'Primero' });
    const second = makeDish({ id: '2', category_id: 'cat', position: 1, name: 'Segundo' });

    const result = groupDishesByCategory([first, second]);

    expect(result.get('cat')).toEqual([first, second]);
  });

  it('descarta los platos sin categoría en vez de agruparlos bajo null', () => {
    const sinCategoria = makeDish({ id: '1', category_id: null });
    const conCategoria = makeDish({ id: '2', category_id: 'cat' });

    const result = groupDishesByCategory([sinCategoria, conCategoria]);

    expect(result.size).toBe(1);
    expect(result.get('cat')).toEqual([conCategoria]);
  });

  it('devuelve un Map vacío para una lista vacía', () => {
    expect(groupDishesByCategory([]).size).toBe(0);
  });
});
