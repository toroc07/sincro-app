import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'SINCRO · Despacho Cartagena',
  description: 'Coordinación local de respuesta prehospitalaria',
  // Isotipo sobre fondo blanco: iOS no respeta la transparencia y compone el
  // icono sobre negro, donde el rojo de la marca se pierde.
  icons: {
    icon: [
      { url: '/images/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/images/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/images/apple-touch-icon.png',
  },
  // El enlace se reparte por WhatsApp: sin esto la tarjeta sale en blanco y
  // parece una web dudosa justo cuando hay que confiar en ella.
  openGraph: {
    type: 'website',
    siteName: 'SINCRO',
    title: 'SINCRO · Despacho Cartagena',
    description: 'Reporta una emergencia con tu voz y sigue la ayuda en tiempo real.',
    images: [{ url: '/images/og-sincro.png', width: 1200, height: 630 }],
  },
  manifest: '/manifest.webmanifest',
  // Se instala en la pantalla de inicio y abre a pantalla completa: en una
  // emergencia nadie quiere buscar una pestaña del navegador.
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'SINCRO' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // NO se limita maximumScale ni se pone userScalable:false. Bloquear el zoom
  // es una barrera de accesibilidad seria, y aquí puede usarla alguien con baja
  // visión que necesita ampliar para leer un ETA.
  themeColor: '#070b14',
  // El contenido llega hasta los bordes; las safe-areas se manejan en CSS.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
