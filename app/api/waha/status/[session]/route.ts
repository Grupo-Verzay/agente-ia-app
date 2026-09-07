import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';
import { ensureWahaSessionEvents, getWahaSession, isWahaConfigured, wahaMePhone } from '@/lib/waha';

/**
 * Estado de una sesion de Waha para la tarjeta de WhatsApp Mensajeria.
 *
 * Devuelve lo justo para pintar la tarjeta. La API key de Waha se queda aqui.
 */
/**
 * La sesion de Waha se llama como la instancia. Antes de servir nada se
 * comprueba que la instancia exista y que quien pregunta mande sobre su cuenta:
 * el QR es la llave para EMPAREJAR la linea de WhatsApp, y con el nombre de la
 * sesion cualquiera -con o sin login- podia pedirlo y escanearlo. Estas rutas
 * solo confiaban en el middleware (H02 de la auditoria del 2026-09-06).
 */
async function asegurarQueEsSuLinea(session: string) {
  const quien = await currentUser();
  if (!quien) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const instancia = await db.instancia.findFirst({
    where: { instanceName: session },
    select: { userId: true },
  });
  if (!instancia) {
    return NextResponse.json({ error: 'Instancia no encontrada.' }, { status: 404 });
  }
  try {
    await assertCanAccessTargetUser(instancia.userId);
  } catch {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { session: string } },
) {
  const rechazo = await asegurarQueEsSuLinea(params.session);
  if (rechazo) return rechazo;

  if (!(await isWahaConfigured())) {
    return NextResponse.json({ error: 'El servidor de WhatsApp Mensajería no esta configurado' }, { status: 503 });
  }

  const session = await getWahaSession(params.session);
  // De fondo: las sesiones creadas antes solo recibian `message`; esto les
  // anade acuses, borrados y presencia sin tener que volver a escanear.
  if (session) void ensureWahaSessionEvents(params.session);

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
