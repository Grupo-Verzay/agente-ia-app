import { NextRequest, NextResponse } from 'next/server';
import { getWahaSession, isWahaConfigured, wahaMePhone } from '@/lib/waha';

/**
 * Estado de una sesion de WAHA para la tarjeta de WhatsApp V2.
 *
 * Devuelve lo justo para pintar la tarjeta. La API key de WAHA se queda aqui.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { session: string } },
) {
  if (!isWahaConfigured()) {
    return NextResponse.json({ error: 'WAHA no configurado' }, { status: 503 });
  }

  const session = await getWahaSession(params.session);

  if (!session) {
    return NextResponse.json(
      { status: 'FAILED', connected: false, hasQr: false },
      { status: 200 },
    );
  }

  return NextResponse.json({
    status: session.status,
    connected: session.status === 'WORKING',
    hasQr: session.status === 'SCAN_QR_CODE',
    pushName: session.me?.pushName ?? null,
    phoneNumber: wahaMePhone(session.me),
  });
}
