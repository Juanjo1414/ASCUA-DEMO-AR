import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Menú AR',
  description: 'Menú digital con visor 3D/AR por restaurante.',
  // iOS no lee el manifest para decidir si la app corre a pantalla completa
  // ni de dónde saca el icono: necesita estas dos claves aparte.
  appleWebApp: {
    capable: true,
    title: 'Ascua',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f0e0d',
  // viewportFit cover para que el fondo llegue bajo la barra de gestos del
  // iPhone cuando la PWA corre instalada.
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
