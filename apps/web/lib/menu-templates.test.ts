import { describe, expect, it } from 'vitest';
import { MENU_TEMPLATES, CUISINE_TYPES, isCuisineType } from './menu-templates';

describe('MENU_TEMPLATES', () => {
  it('trae al menos una plantilla con categorías reales, además de "otra"', () => {
    const withDishes = Object.values(MENU_TEMPLATES).filter(
      (template) => template.categories.length > 0
    );
    expect(withDishes.length).toBeGreaterThan(0);
  });

  it('"otra" existe y arranca sin categorías (empezar vacío)', () => {
    expect(MENU_TEMPLATES.otra.categories).toEqual([]);
  });

  it('toda categoría de toda plantilla trae al menos un plato', () => {
    for (const template of Object.values(MENU_TEMPLATES)) {
      for (const category of template.categories) {
        expect(category.dishes.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('isCuisineType', () => {
  it('acepta las claves reales de MENU_TEMPLATES', () => {
    for (const type of CUISINE_TYPES) {
      expect(isCuisineType(type)).toBe(true);
    }
  });

  it('rechaza cualquier otro string', () => {
    expect(isCuisineType('coreana')).toBe(false);
    expect(isCuisineType('')).toBe(false);
  });
});
