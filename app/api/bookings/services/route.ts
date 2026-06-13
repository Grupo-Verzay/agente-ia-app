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
 * GET /api/bookings/services?userId=X
 *
 * Devuelve los servicios activos del equipo de booking del usuario.
 * Usado por el agente IA para presentarlos al cliente al agendar una cita.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId')?.trim();

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const team = await db.team.findUnique({
    where: { userId },
    select: {
      id: true,
      name: true,
      timezone: true,
      minNoticeMinutes: true,
      services: {
        where: { isActive: true },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          duration: true,
          color: true,
          members: {
            select: {
              teamMember: {
                select: { id: true, name: true, isActive: true },
              },
            },
          },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: 'Equipo de booking no encontrado para este usuario' }, { status: 404 });
  }

  const services = team.services.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    duration: s.duration,
    color: s.color,
    members: s.members
      .filter((m) => m.teamMember.isActive)
      .map((m) => ({ id: m.teamMember.id, name: m.teamMember.name })),
  }));

  console.log(`[bookings/services] userId=${userId} teamId=${team.id} → ${services.length} servicios`);

  return NextResponse.json({
    teamId: team.id,
    teamName: team.name,
    timezone: team.timezone,
    minNoticeMinutes: team.minNoticeMinutes,
    services,
    total: services.length,
  }, { status: 200 });
}
