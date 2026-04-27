import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAvailableSlots } from '@/actions/getAvailableSlots-actions';

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
 * GET /api/schedule/slots?userId=X&date=YYYY-MM-DD&timezone=America/Bogota
 *
 * Devuelve los slots disponibles para una fecha dada.
 * El agente IA llama este endpoint después de que el cliente elige una fecha.
 *
 * Query params:
 *   userId   — requerido
 *   date     — requerido, formato YYYY-MM-DD (en la TZ del dueño)
 *   timezone — opcional, TZ del servidor como fallback (default: UTC)
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId   = searchParams.get('userId')?.trim();
  const date     = searchParams.get('date')?.trim();
  const timezone = searchParams.get('timezone')?.trim() ?? 'UTC';

  if (!userId || !date) {
    return NextResponse.json({ error: 'userId and date are required' }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be in YYYY-MM-DD format' }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { meetingDuration: true },
  });

  const slotDuration = user?.meetingDuration ?? 30;

  const result = await getAvailableSlots(userId, date, slotDuration, timezone);

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(
    { slots: result.data ?? [], total: result.data?.length ?? 0 },
    { status: 200 }
  );
}
