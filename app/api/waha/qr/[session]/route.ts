import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';
import { getWahaQrPng, isWahaConfigured } from '@/lib/waha';

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

/**
 * El QR de una sesion de Waha, como PNG.
 *
 * Cuando no hay QR responde JSON con el motivo, NUNCA se queda colgada: el
 * `<img>` de la tarjeta solo sabe de `onLoad`/`onError`, asi que una respuesta
 * que no llega deja la pantalla girando para siempre.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { session: string } },
) {
  const rechazo = await asegurarQueEsSuLinea(params.session);
  if (rechazo) return rechazo;

  if (!(await isWahaConfigured())) {
    return NextResponse.json({ error: 'La conexión por QR no está configurada. Avisa a un administrador.' }, { status: 503 });
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
