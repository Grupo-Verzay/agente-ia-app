import type { MetadataRoute } from 'next';

// Manifest de la PWA: hace la app instalable en el móvil ("Agregar a pantalla de
// inicio") y, con display 'standalone', se abre a pantalla completa como una app
// nativa, con su propio contenedor de almacenamiento persistente (mantiene la sesión).
// Next 14 lo sirve en /manifest.webmanifest y añade el <link rel="manifest"> solo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Verzay',
    short_name: 'Verzay',
    description:
      'La plataforma de inteligencia artificial que potencia y automatiza tu negocio.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
