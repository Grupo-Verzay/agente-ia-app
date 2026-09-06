import { NextRequest, NextResponse } from 'next/server';
import { getWahaQrPng, isWahaConfigured } from '@/lib/waha';

/**
 * El QR de una sesion de WAHA, como PNG.
 *
 * Cuando no hay QR responde JSON con el motivo, NUNCA se queda colgada: el
 * `<img>` de la tarjeta solo sabe de `onLoad`/`onError`, asi que una respuesta
 * que no llega deja la pantalla girando para siempre.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { session: string } },
) {
  if (!(await isWahaConfigured())) {
    return NextResponse.json({ error: 'El servidor de WhatsApp V2 no esta configurado' }, { status: 503 });
  }

  const resultado = await getWahaQrPng(params.session);

  if (resultado.estado === 'ok') {
    return new NextResponse(resultado.png, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  }

  // 409: la sesion existe pero no esta esperando escaneo — se arregla
  // reiniciandola, no reintentando el QR. 502: el servidor no contesta.
  return NextResponse.json(
    { error: resultado.motivo },
    { status: resultado.estado === 'todavia-no' ? 409 : 502 },
  );
}
