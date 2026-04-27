import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
 * GET /api/schedule/services?userId=X
 *
 * Devuelve los servicios activos de un usuario para que el agente IA
 * pueda presentarlos al cliente y elegir uno al agendar una cita.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId')?.trim();

  if (!isAuthorized(request)) {
    console.error('[schedule/services] Unauthorized — verifica CRM_FOLLOW_UP_RUNNER_KEY. userId recibido:', userId);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!userId) {
    console.error('[schedule/services] userId faltante en la request');
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const services = await db.service.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, description: true },
  });

  console.log(`[schedule/services] userId=${userId} → ${services.length} servicios encontrados`);

  return NextResponse.json({ services, total: services.length }, { status: 200 });
}
