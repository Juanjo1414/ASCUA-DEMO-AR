import { describe, expect, it } from 'vitest';
import { estaAgotado, siguienteMedianoche } from './agotado';

describe('estaAgotado', () => {
  const ahora = new Date('2026-09-13T15:00:00Z').getTime();

  it('no está agotado sin fecha', () => {
    expect(estaAgotado(null, ahora)).toBe(false);
    expect(estaAgotado(undefined, ahora)).toBe(false);
  });

  it('está agotado mientras la fecha siga en el futuro', () => {
    expect(estaAgotado('2026-09-14T05:00:00Z', ahora)).toBe(true);
  });

  it('vuelve solo cuando la fecha ya pasó', () => {
    expect(estaAgotado('2026-09-13T05:00:00Z', ahora)).toBe(false);
  });

  it('una fecha inválida no deja el plato agotado', () => {
    expect(estaAgotado('no-es-fecha', ahora)).toBe(false);
  });
});

describe('siguienteMedianoche', () => {
  it('cae al día siguiente a las 00:00 locales', () => {
    const desde = new Date(2026, 8, 13, 21, 30);
    const m = siguienteMedianoche(desde);
    expect([m.getFullYear(), m.getMonth(), m.getDate(), m.getHours(), m.getMinutes()]).toEqual([
      2026, 8, 14, 0, 0,
    ]);
  });

  it('pasa bien de fin de mes', () => {
    const m = siguienteMedianoche(new Date(2026, 8, 30, 23, 59));
    expect([m.getMonth(), m.getDate(), m.getHours()]).toEqual([9, 1, 0]);
  });
});
