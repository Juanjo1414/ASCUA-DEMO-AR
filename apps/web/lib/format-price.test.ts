import { describe, expect, it } from 'vitest';
import { formatPriceCOP } from './format-price';

// Aserciones con regex, no con el string exacto: el formato ICU de
// Intl.NumberFormat('es-CO', ...) (espacios, separador de miles) puede
// variar entre versiones de Node, y no pude correr esto para confirmar
// el output literal en esta sesión sin red. Lo que sí importa probar:
// que divide por 100, que redondea sin decimales, y que usa pesos.
describe('formatPriceCOP', () => {
  it('divide los centavos entre 100 para obtener el valor en pesos', () => {
    // 1.500.000 centavos = $15.000 COP — el "Patacón con hogao" del seed.
    expect(formatPriceCOP(1_500_000)).toMatch(/15[.,]000/);
  });

  it('redondea sin mostrar decimales aunque el valor no sea exacto', () => {
    // 1.234 centavos = 12,34 pesos → debe redondear a 12, sin coma decimal.
    const result = formatPriceCOP(1_234);
    expect(result).toMatch(/12/);
    expect(result).not.toMatch(/12[.,]3/);
  });

  it('formatea cero sin lanzar y sin dejarlo vacío', () => {
    const result = formatPriceCOP(0);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/0/);
  });

  it('usa el símbolo de peso', () => {
    expect(formatPriceCOP(100)).toMatch(/\$/);
  });
});
