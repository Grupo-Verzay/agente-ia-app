import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

import { getPublicBrandingByUserId, getPublicBrandingBySlug } from '@/actions/public-branding-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ícono de la PWA por reseller: toma el logo del reseller (logoUrl, normalmente
// en S3) y lo normaliza a un PNG cuadrado del tamaño pedido, con relleno blanco
// para logos no cuadrados. Si no hay logo o algo falla, redirige al ícono
// estático de la plataforma (Verzay) para no romper la instalabilidad de la PWA.
const SIZES: Record<string, number> = { '180': 180, '192': 192, '512': 512 };
const BG = '#ffffff';

function staticFallback(origin: string, size: number, maskable: boolean): NextResponse {
  const file = maskable
    ? '/icon-maskable-512.png'
    : size === 180
      ? '/apple-touch-icon.png'
      : size === 192
        ? '/icon-192.png'
        : '/icon-512.png';
  return NextResponse.redirect(new URL(file, origin));
}

async function loadImage(logoUrl: string | null, origin: string): Promise<Buffer | null> {
  if (!logoUrl) return null;
  const url = /^https?:\/\//.test(logoUrl)
    ? logoUrl
    : `${origin}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const size = SIZES[searchParams.get('size') ?? '512'] ?? 512;
  const maskable = searchParams.get('maskable') === '1';
  const u = searchParams.get('u');
  const r = searchParams.get('r');

  let logoUrl: string | null = null;
  try {
    const branding = r
      ? await getPublicBrandingBySlug(r)
      : u
        ? await getPublicBrandingByUserId(u)
        : null;
    logoUrl = branding?.logoUrl ?? null;
  } catch {
    return staticFallback(origin, size, maskable);
  }

  try {
    const srcBuf = await loadImage(logoUrl, origin);
    if (!srcBuf) return staticFallback(origin, size, maskable);

    // Recorta el margen uniforme del logo para que no quede diminuto dentro del
    // ícono (muchos logos vienen con mucho espacio en blanco alrededor). Si el
    // trim falla (imagen uniforme), usa el original.
    const trimmed = await sharp(srcBuf).trim({ threshold: 10 }).png().toBuffer().catch(() => srcBuf);

    // El logo llena el ~86% del tile (72% en maskable, por la zona segura del
    // recorte circular de Android), centrado sobre fondo.
    const ratio = maskable ? 0.72 : 0.86;
    const inner = Math.round(size * ratio);
    const logo = await sharp(trimmed)
      .resize(inner, inner, { fit: 'contain', background: BG })
      .png()
      .toBuffer();
    const png = await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toBuffer();

    return new NextResponse(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch {
    return staticFallback(origin, size, maskable);
  }
}
