import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';
import { getWahaQrPng, isWahaConfigured } from '@/lib/waha';

/** El QR de una sesion de WAHA, como PNG. */
/**
 * La sesion de WAHA se llama como la instancia. Antes de servir nada se
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
