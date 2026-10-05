// Plantillas de menú precargadas por tipo de cocina (Fase 6): que el
// dueño no arranque de una pantalla vacía en /registro. Sin precios ni
// fotos — eso lo completa él mismo en el panel; esto solo da estructura.

export interface MenuTemplateDish {
  name: string;
}

export interface MenuTemplateCategory {
  name: string;
  dishes: MenuTemplateDish[];
}

export interface MenuTemplate {
  label: string;
  categories: MenuTemplateCategory[];
}

export const MENU_TEMPLATES = {
  colombiana: {
    label: 'Colombiana',
    categories: [
      { name: 'Entradas', dishes: [{ name: 'Patacón con hogao' }, { name: 'Empanadas' }] },
      {
        name: 'Platos fuertes',
        dishes: [{ name: 'Bandeja paisa' }, { name: 'Ajiaco santafereño' }, { name: 'Sancocho' }],
      },
    ],
  },
  italiana: {
    label: 'Italiana',
    categories: [
      { name: 'Entradas', dishes: [{ name: 'Bruschetta' }, { name: 'Carpaccio' }] },
      { name: 'Pastas', dishes: [{ name: 'Fettuccine Alfredo' }, { name: 'Lasagna' }] },
      { name: 'Pizzas', dishes: [{ name: 'Margarita' }, { name: 'Cuatro quesos' }] },
    ],
  },
  mexicana: {
    label: 'Mexicana',
    categories: [
      { name: 'Entradas', dishes: [{ name: 'Guacamole' }, { name: 'Nachos' }] },
      { name: 'Platos fuertes', dishes: [{ name: 'Tacos al pastor' }, { name: 'Enchiladas' }] },
    ],
  },
  otra: {
    label: 'Otra / prefiero empezar vacío',
    categories: [],
  },
} as const satisfies Record<string, MenuTemplate>;

export type CuisineType = keyof typeof MENU_TEMPLATES;

export const CUISINE_TYPES = Object.keys(MENU_TEMPLATES) as CuisineType[];

export function isCuisineType(value: string): value is CuisineType {
  return value in MENU_TEMPLATES;
}
