import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DishCard } from './DishCard';

// next/image hace optimización server-side que no tiene sentido en jsdom;
// lo reemplazamos por un <img> plano que reenvía las props relevantes.
vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

const baseDish = {
  name: 'Ajiaco santafereño',
  description: 'Pollo, papas y guascas.',
  price_cents: 3_200_000, // $32.000 COP — el mismo plato del seed
  photo_url: 'https://example.supabase.co/storage/v1/object/public/dish-photos/ajiaco.jpg',
};

describe('DishCard', () => {
  it('muestra la foto 2D cuando el plato no tiene modelo 3D activo', () => {
    render(<DishCard restaurantId="r-1" dishId="d-1" textoVer3d="Ver en 3D" textoVerAr="Ver en RA" textoCerrar="Cerrar" textoAviso="Modelo referencial." textoAgotado="Agotado" dish={baseDish} />);

    expect(screen.getByRole('img', { name: baseDish.name })).toBeInTheDocument();
    expect(screen.queryByText('Ver en 3D')).not.toBeInTheDocument();
    expect(screen.queryByText('Ver en RA')).not.toBeInTheDocument();
  });

  it('muestra el botón de AR cuando hay un dish_assets activo con glb y poster', () => {
    render(
      <DishCard restaurantId="r-1" dishId="d-1" textoVer3d="Ver en 3D" textoVerAr="Ver en RA" textoCerrar="Cerrar" textoAviso="Modelo referencial." textoAgotado="Agotado"
        dish={baseDish}
        arAsset={{
          glb_url: 'https://example.supabase.co/dish-assets/ajiaco.glb',
          usdz_url: 'https://example.supabase.co/dish-assets/ajiaco.usdz',
          poster_url: 'https://example.supabase.co/dish-assets/ajiaco-poster.webp',
        }}
      />
    );

    expect(screen.getByText('Ver en 3D')).toBeInTheDocument();
    expect(screen.getByText('Ver en RA')).toBeInTheDocument();
  });

  it('cae de vuelta a la foto 2D si el dish_assets no tiene poster_url todavía', () => {
    render(
      <DishCard restaurantId="r-1" dishId="d-1" textoVer3d="Ver en 3D" textoVerAr="Ver en RA" textoCerrar="Cerrar" textoAviso="Modelo referencial." textoAgotado="Agotado"
        dish={baseDish}
        arAsset={{
          glb_url: 'https://example.supabase.co/dish-assets/ajiaco.glb',
          usdz_url: null,
          poster_url: null,
        }}
      />
    );

    expect(screen.queryByText('Ver en 3D')).not.toBeInTheDocument();
    expect(screen.queryByText('Ver en RA')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: baseDish.name })).toBeInTheDocument();
  });

  it('no rompe si el plato no tiene foto ni modelo 3D', () => {
    render(<DishCard restaurantId="r-1" dishId="d-1" textoVer3d="Ver en 3D" textoVerAr="Ver en RA" textoCerrar="Cerrar" textoAviso="Modelo referencial." textoAgotado="Agotado" dish={{ ...baseDish, photo_url: null }} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('muestra el nombre y el precio formateado', () => {
    render(<DishCard restaurantId="r-1" dishId="d-1" textoVer3d="Ver en 3D" textoVerAr="Ver en RA" textoCerrar="Cerrar" textoAviso="Modelo referencial." textoAgotado="Agotado" dish={baseDish} />);

    expect(screen.getByText(baseDish.name)).toBeInTheDocument();
    expect(screen.getByText(/32[.,]000/)).toBeInTheDocument();
  });
});
