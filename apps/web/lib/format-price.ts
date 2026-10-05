// Extraído de DishCard.tsx para poder testearlo sin montar el componente.
export function formatPriceCOP(priceCents: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}
