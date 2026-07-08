import { NextRequest, NextResponse } from 'next/server';

import { getPublicBrandingByUserId, getPublicBrandingBySlug } from '@/actions/public-branding-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Manifest PWA dinámico por reseller (white-label en un solo dominio).
// El navegador pide el manifest SIN cookies, así que la marca se pasa por query:
//   ?u=<userId>  → dentro de la app (el layout autenticado conoce al usuario/reseller)
//   ?r=<slug>    → landings públicas /r/[slug]
// Sin parámetros → marca por defecto de la plataforma (Verzay). Los íconos se
// sirven desde /api/brand-icon, que normaliza el logo del reseller a cuadrado.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const u = searchParams.get('u');
  const r = searchParams.get('r');

  let name = 'Verzay';
  try {
    const branding = r
      ? await getPublicBrandingBySlug(r)
      : u
        ? await getPublicBrandingByUserId(u)
        : null;
    if (branding?.brandName?.trim()) name = branding.brandName.trim();
  } catch {
    // marca por defecto
  }

  // Propaga la identidad del reseller a los íconos.
  const iconQuery = r ? `&r=${encodeURIComponent(r)}` : u ? `&u=${encodeURIComponent(u)}` : '';

  const manifest = {
    id: r ? `/?r=${r}` : u ? `/?u=${u}` : '/',
    name,
    short_name: name,
    description:
      'La plataforma de inteligencia artificial que potencia y automatiza tu negocio.',
    // Ruta de arranque: /abrir decide (server-side) entrar a Chats o al home
    // según el acceso del plan. Ver app/abrir/page.tsx.
    start_url: '/abrir',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: `/api/brand-icon?size=192${iconQuery}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/api/brand-icon?size=512${iconQuery}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/api/brand-icon?size=512&maskable=1${iconQuery}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=600',
    },
  });
}
