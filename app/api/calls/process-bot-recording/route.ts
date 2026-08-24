import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processCallRecordingForUser } from '@/actions/calls-recording-actions';

// La llamada del bot no tiene sesión de navegador que avise cuándo cuelga, así
// que es el backend quien detecta que la grabación ya está lista y pide aquí
// el mismo procesamiento (transcripción + resumen + duración) que ya corre
// para las llamadas en vivo del asesor. Autenticado con el mismo secreto
// interno que el resto de rutas backend -> App (ver /api/external-client-data).

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim();
  if (!expected) return false;
  const bearer = request.headers.get('authorization');
  const secret = bearer?.startsWith('Bearer ')
    ? bearer.slice(7).trim()
    : (request.headers.get('x-internal-secret') ?? '').trim();
  return secret === expected;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const instanceName = typeof body?.instanceName === 'string' ? body.instanceName.trim() : '';
  const messageId = typeof body?.messageId === 'string' ? body.messageId.trim() : '';
  const astraSid = typeof body?.astraSid === 'string' ? body.astraSid.trim() : '';
  const astraCallId = typeof body?.astraCallId === 'string' ? body.astraCallId.trim() : '';

  if (!userId || !instanceName || !messageId || !astraSid || !astraCallId) {
    return NextResponse.json(
      { error: 'userId, instanceName, messageId, astraSid y astraCallId son requeridos' },
      { status: 400 },
    );
  }

  // El backend conoce el messageId que el mismo escribio (callout_...), no el
  // id numerico de la fila: se resuelve aqui, igual que hace logOutgoingCallAction.
  const row = await db.chatMessage.findFirst({
    where: { userId, instanceName, messageId, fromMe: true },
    select: { id: true },
  });
  if (!row) return NextResponse.json({ success: false, message: 'Llamada no encontrada.' });

  const result = await processCallRecordingForUser({
    userId,
    chatMessageId: String(row.id),
    astraSid,
    astraCallId,
  });
  return NextResponse.json(result);
}
