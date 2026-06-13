import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAvailableBookingSlots } from '@/actions/bookings-actions';

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
 * GET /api/bookings/slots?userId=X&serviceId=Y&date=YYYY-MM-DD[&memberId=Z]
 *
 * Devuelve los slots disponibles para un servicio en una fecha.
 * Si no se pasa memberId, combina slots de todos los miembros del servicio
 * (o del equipo si el servicio no tiene miembros asignados).
 * Cada slot incluye el memberId asignado para poder crear la cita directamente.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId   = searchParams.get('userId')?.trim();
  const serviceId = searchParams.get('serviceId')?.trim();
  const date     = searchParams.get('date')?.trim();
  const memberId = searchParams.get('memberId')?.trim();

  if (!userId || !serviceId || !date) {
    return NextResponse.json({ error: 'userId, serviceId and date are required' }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be in YYYY-MM-DD format' }, { status: 400 });
  }

  const team = await db.team.findUnique({
    where: { userId },
    select: {
      id: true,
      timezone: true,
      minNoticeMinutes: true,
      members: {
        where: { isActive: true },
        select: { id: true, name: true },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: 'Equipo de booking no encontrado' }, { status: 404 });
  }

  const service = await db.teamService.findFirst({
    where: { id: serviceId, teamId: team.id, isActive: true },
    select: {
      id: true,
      name: true,
      duration: true,
      members: {
        select: {
          teamMember: { select: { id: true, name: true, isActive: true } },
        },
      },
    },
  });

  if (!service) {
    return NextResponse.json({ error: 'Servicio no encontrado o inactivo' }, { status: 404 });
  }

  // Determinar qué miembros consultar
  const assignedMembers = service.members
    .filter((m) => m.teamMember.isActive)
    .map((m) => m.teamMember);
  const candidateMembers = assignedMembers.length > 0 ? assignedMembers : team.members;

  const targetMembers = memberId
    ? candidateMembers.filter((m) => m.id === memberId)
    : candidateMembers;

  if (targetMembers.length === 0) {
    return NextResponse.json({ slots: [], total: 0 }, { status: 200 });
  }

  // Obtener slots de cada miembro y combinar (eliminando duplicados de horario)
  type SlotEntry = { startTime: string; endTime: string; label: string; memberId: string; memberName: string };
  const seenStartTimes = new Set<string>();
  const allSlots: SlotEntry[] = [];

  await Promise.all(
    targetMembers.map(async (member) => {
      const result = await getAvailableBookingSlots(
        member.id,
        date,
        service.duration,
        team.timezone,
        team.minNoticeMinutes,
      );

      if (!result.success || !result.data) return;

      for (const slot of result.data) {
        // Si ya hay un slot en ese horario (de otro miembro), lo omitimos
        // para presentar una lista limpia al cliente; se asignará al primer disponible
        if (!seenStartTimes.has(slot.startTime)) {
          seenStartTimes.add(slot.startTime);
          allSlots.push({
            startTime: slot.startTime,
            endTime: slot.endTime,
            label: slot.label,
            memberId: member.id,
            memberName: member.name,
          });
        }
      }
    }),
  );

  // Ordenar por hora de inicio
  allSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

  console.log(`[bookings/slots] userId=${userId} serviceId=${serviceId} date=${date} → ${allSlots.length} slots`);

  return NextResponse.json({
    slots: allSlots,
    total: allSlots.length,
    timezone: team.timezone,
    serviceName: service.name,
    duration: service.duration,
  }, { status: 200 });
}
