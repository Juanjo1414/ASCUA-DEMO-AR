// @google/model-viewer no trae tipos de React: sin esto TS rechaza
// <model-viewer ar ar-modes="..." ... /> en ArViewer.tsx por ser un
// elemento HTML desconocido.

import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type ModelViewerAttributes = Partial<{
  src: string;
  'ios-src': string;
  poster: string;
  alt: string;
  ar: boolean;
  'ar-modes': string;
  'ar-scale': string;
  'ar-placement': string;
  'camera-controls': boolean;
  'touch-action': string;
  'shadow-intensity': string;
  reveal: string;
}>;

type ModelViewerJSX = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> &
  ModelViewerAttributes;

// React 19 (@types/react 19.x) ya no expone un namespace JSX global
// augmentable — vive en React.JSX y se reexporta desde el propio módulo
// 'react' (ver react/jsx-runtime.d.ts: `export { JSX } from "./"`). Por
// eso la augmentación va sobre el módulo 'react', no sobre `declare
// global`; eso es lo que probamos primero y `tsc` seguía sin ver
// <model-viewer> — recién se confirmó al correr el compilador de verdad.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerJSX;
    }
  }
}
