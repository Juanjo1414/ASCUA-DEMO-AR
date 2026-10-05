import { describe, expect, it } from 'vitest';
import { cupoIdiomasAdicionales, idiomasPublicados, limitesDe, tieneAnalitica } from './plans';

describe('limitesDe', () => {
  it('cae en starter ante un plan desconocido en vez de reventar', () => {
    expect(limitesDe('plan-que-ya-no-existe').nombre).toBe('Starter');
    expect(limitesDe(null).nombre).toBe('Starter');
    expect(limitesDe(undefined).nombre).toBe('Starter');
  });
});

describe('tieneAnalitica', () => {
  it('está incluida en todos los planes', () => {
    expect(tieneAnalitica('starter')).toBe(true);
    expect(tieneAnalitica('growth')).toBe(true);
    expect(tieneAnalitica('business')).toBe(true);
  });
});

describe('cupoIdiomasAdicionales', () => {
  it('starter y growth traen uno adicional; business, sin límite', () => {
    expect(cupoIdiomasAdicionales('starter', 0)).toBe(1);
    expect(cupoIdiomasAdicionales('growth', 0)).toBe(1);
    expect(cupoIdiomasAdicionales('business', 0)).toBeNull();
  });

  it('suma los idiomas extra activados a mano', () => {
    expect(cupoIdiomasAdicionales('starter', 1)).toBe(2);
    expect(cupoIdiomasAdicionales('growth', 2)).toBe(3);
  });

  it('ignora valores extra negativos, decimales o vacíos', () => {
    expect(cupoIdiomasAdicionales('starter', -3)).toBe(1);
    expect(cupoIdiomasAdicionales('starter', 1.9)).toBe(2);
    expect(cupoIdiomasAdicionales('starter', null)).toBe(1);
    expect(cupoIdiomasAdicionales('starter', undefined)).toBe(1);
  });
});

describe('idiomasPublicados', () => {
  it('todos los planes publican dos idiomas: el base y uno más', () => {
    expect(idiomasPublicados('starter', 'es', ['en', 'it'])).toEqual(['es', 'en']);
    expect(idiomasPublicados('growth', 'es', ['en', 'it'])).toEqual(['es', 'en']);
  });

  it('business publica todos los activos', () => {
    expect(idiomasPublicados('business', 'es', ['en', 'it', 'de'])).toEqual(['es', 'en', 'it', 'de']);
  });

  it('un tercer idioma pagado aparte se publica sin cambiar de plan', () => {
    expect(idiomasPublicados('starter', 'es', ['en', 'it'], 1)).toEqual(['es', 'en', 'it']);
  });

  it('respeta el idioma base del restaurante: inglés en Malta', () => {
    expect(idiomasPublicados('starter', 'en', ['it'])).toEqual(['en', 'it']);
  });

  it('no repite el base ni idiomas duplicados en la lista de activos', () => {
    expect(idiomasPublicados('business', 'en', ['en', 'de', 'de'])).toEqual(['en', 'de']);
  });

  it('ignora códigos de idioma que la carta no sabe servir', () => {
    expect(idiomasPublicados('business', 'es', ['en', 'klingon', 'pt'])).toEqual(['es', 'en']);
  });

  it('cae a español si el idioma base viene vacío o es inválido', () => {
    expect(idiomasPublicados('growth', null, ['en'])).toEqual(['es', 'en']);
    expect(idiomasPublicados('growth', 'xx', ['en'])).toEqual(['es', 'en']);
  });

  it('funciona sin idiomas activos', () => {
    expect(idiomasPublicados('business', 'es', [])).toEqual(['es']);
    expect(idiomasPublicados('starter', 'es', null)).toEqual(['es']);
  });

  it('quitar el idioma extra no borra las traducciones guardadas, sólo publica menos', () => {
    const guardados = ['en', 'it'];
    expect(idiomasPublicados('starter', 'es', guardados, 1)).toHaveLength(3);
    expect(idiomasPublicados('starter', 'es', guardados, 0)).toHaveLength(2);
    expect(guardados).toEqual(['en', 'it']);
  });
});
