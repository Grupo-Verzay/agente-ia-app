import { NextRequest, NextResponse } from 'next/server';
import { getWahaQrPng, isWahaConfigured } from '@/lib/waha';

/** El QR de una sesion de WAHA, como PNG. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { session: string } },
) {
  if (!(await isWahaConfigured())) {
    return NextResponse.json({ error: 'WAHA no configurado' }, { status: 503 });
  }

  const png = await getWahaQrPng(params.session);

  // Solo hay QR mientras la sesion esta en SCAN_QR_CODE. En cualquier otro
  // estado WAHA responde con error y aqui se traduce a un 404 limpio, para que
  // la tarjeta lo trate como "todavia no hay QR" y no como una caida.
  if (!png) {
    return NextResponse.json({ error: 'QR no disponible' }, { status: 404 });
  }

  return new NextResponse(png, {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}
