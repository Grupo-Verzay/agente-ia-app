import { NextResponse } from 'next/server';
import { sendingImageMessage } from '@/actions/sending-image-actions';

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim();
  if (!expected) return false;
  const bearer = request.headers.get('authorization');
  const secret = bearer?.startsWith('Bearer ')
    ? bearer.slice(7).trim()
    : (request.headers.get('x-internal-secret') ?? '').trim();
  return secret === expected;
}

/**
 * POST /api/send-media
 *
 * Endpoint para que NestJS envíe imágenes/media a WhatsApp vía Evolution API.
 * Se llama después de una respuesta de tool buscar_producto o listar_productos
 * cuando el producto tiene imágenes en el campo `images`.
 *
 * Body JSON:
 * {
 *   instanceName: string        — nombre de la instancia Evolution (ej: "instancia-107")
 *   serverUrl: string           — URL base del servidor Evolution (ej: "https://evo.host.com")
 *   apikey: string              — API key de la instancia
 *   remoteJid: string           — número destino (ej: "573107964105@s.whatsapp.net")
 *   mediaUrl: string            — URL pública de la imagen
 *   caption?: string            — texto debajo de la imagen (opcional)
 *   mediaType?: string          — "image" | "video" | "document" | "audio" (default: "image")
 * }
 *
 * Respuesta exitosa:
 *   { success: true, message: "Imagen enviada correctamente." }
 *
 * Ejemplo de uso desde NestJS después de buscar_producto:
 *   const product = toolResult.products[0];
 *   if (product.images?.length > 0) {
 *     await fetch(`${nextjsUrl}/api/send-media`, {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
 *       body: JSON.stringify({
 *         instanceName, serverUrl, apikey, remoteJid,
 *         mediaUrl: product.images[0],
 *         caption: `${product.title} - $${product.price}`,
 *       }),
 *     });
 *   }
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { instanceName, serverUrl, apikey, remoteJid, mediaUrl, caption, mediaType } = body as {
    instanceName?: string;
    serverUrl?: string;
    apikey?: string;
    remoteJid?: string;
    mediaUrl?: string;
    caption?: string;
    mediaType?: string;
  };

  // Validación de campos requeridos
  if (!instanceName || !serverUrl || !apikey || !remoteJid || !mediaUrl) {
    return NextResponse.json(
      {
        error: 'Faltan campos requeridos: instanceName, serverUrl, apikey, remoteJid, mediaUrl',
      },
      { status: 400 },
    );
  }

  const normalizedServerUrl = serverUrl.replace(/\/+$/, '');
  const evoUrl = `${normalizedServerUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`;

  const result = await sendingImageMessage({
    url: evoUrl,
    apikey,
    remoteJid,
    mediaUrl,
    caption: caption ?? '',
    mediaType: (mediaType as 'image' | 'video' | 'document' | 'audio') ?? 'image',
    instanceName,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? result.message }, { status: 502 });
  }

  return NextResponse.json({ success: true, message: result.message }, { status: 200 });
}
