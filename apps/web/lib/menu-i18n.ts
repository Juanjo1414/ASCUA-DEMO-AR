import type { Idioma } from '@/lib/plans';

// Textos fijos de la carta. Son cuatro frases: una tabla acá pesa menos que
// traer una librería de internacionalización entera, y el comensal descarga
// menos.
type Clave = 'invitacion' | 'ver3d' | 'verAr' | 'aviso' | 'cerrar' | 'idioma' | 'agotado' | 'hechoCon';

const TEXTOS: Record<Idioma, Record<Clave, string>> = {
  es: {
    invitacion: 'Toca un plato para verlo en 3D o sobre tu mesa',
    ver3d: 'Ver en 3D',
    verAr: 'Ver en RA',
    aviso: 'Los modelos 3D son referenciales. La presentación puede variar.',
    cerrar: 'Cerrar',
    idioma: 'Idioma',
    agotado: 'Agotado',
    hechoCon: 'Hecho con',
  },
  en: {
    invitacion: 'Tap a dish to see it in 3D or on your table',
    ver3d: 'View in 3D',
    verAr: 'View in AR',
    aviso: '3D models are for reference. Actual plating may vary.',
    cerrar: 'Close',
    idioma: 'Language',
    agotado: 'Sold out',
    hechoCon: 'Made with',
  },
  it: {
    invitacion: 'Tocca un piatto per vederlo in 3D o sul tuo tavolo',
    ver3d: 'Vedi in 3D',
    verAr: 'Vedi in RA',
    aviso: 'I modelli 3D sono indicativi. La presentazione può variare.',
    cerrar: 'Chiudi',
    idioma: 'Lingua',
    agotado: 'Esaurito',
    hechoCon: 'Realizzato con',
  },
  de: {
    invitacion: 'Tippe auf ein Gericht, um es in 3D oder auf deinem Tisch zu sehen',
    ver3d: 'In 3D ansehen',
    verAr: 'In AR ansehen',
    aviso: '3D-Modelle dienen als Referenz. Die Darstellung kann abweichen.',
    cerrar: 'Schließen',
    idioma: 'Sprache',
    agotado: 'Ausverkauft',
    hechoCon: 'Erstellt mit',
  },
  fr: {
    invitacion: 'Touchez un plat pour le voir en 3D ou sur votre table',
    ver3d: 'Voir en 3D',
    verAr: 'Voir en RA',
    aviso: 'Les modèles 3D sont indicatifs. La présentation peut varier.',
    cerrar: 'Fermer',
    idioma: 'Langue',
    agotado: 'Épuisé',
    hechoCon: 'Réalisé avec',
  },
};

export function textos(lang: Idioma): Record<Clave, string> {
  return TEXTOS[lang] ?? TEXTOS.es;
}
