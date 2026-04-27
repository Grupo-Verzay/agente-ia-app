import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createAppointment } from '@/actions/appointments-actions';

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim();
  if (!expected) return false;
  const bearer = request.headers.get('authorization');
  const secret = bearer?.startsWith('Bearer ')
    ? bearer.slice(7).trim()
    : (request.headers.get('x-internal-secret') ?? '').trim();
  return secret === expected;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resuelve serviceId: acepta UUID o nombre del servicio (case-insensitive).
 * El agente IA a veces pasa el nombre en lugar del ID.
 */
async function resolveServiceId(userId: string, serviceId: string): Promise<string | null> {
  if (UUID_RE.test(serviceId)) {
    const svc = await db.service.findFirst({ where: { id: serviceId, userId }, select: { id: true } });
    return svc?.id ?? null;
  }
  const svc = await db.service.findFirst({
    where: { userId, name: { equals: serviceId, mode: 'insensitive' } },
    select: { id: true },
  });
  return svc?.id ?? null;
}

/**
 * POST /api/schedule/appointment
 *
 * Crea una cita desde el agente IA. serviceId puede ser el UUID o el nombre
 * del servicio (el agente a veces envía el nombre en lugar del ID).
 *
 * Body JSON:
 *   userId       — requerido
 *   serviceId    — requerido (UUID o nombre del servicio)
 *   pushName     — requerido (nombre del cliente en WhatsApp)
 *   phone        — requerido (remoteJid: número@s.whatsapp.net)
 *   instanceName — requerido (instancia WhatsApp del dueño)
 *   startTime    — requerido (ISO 8601 UTC)
 *   endTime      — requerido (ISO 8601 UTC)
 *   timezone     — requerido (TZ del cliente, ej: "America/Bogota")
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, serviceId: rawServiceId, pushName, phone, instanceName, startTime, endTime, timezone } = body;

  if (!userId || !rawServiceId || !pushName || !phone || !instanceName || !startTime || !endTime || !timezone) {
    return NextResponse.json(
      { error: 'Missing required fields: userId, serviceId, pushName, phone, instanceName, startTime, endTime, timezone' },
      { status: 400 }
    );
  }

  const resolvedServiceId = await resolveServiceId(userId, rawServiceId);
  if (!resolvedServiceId) {
    console.error(`[schedule/appointment] Servicio no encontrado: userId=${userId} serviceId="${rawServiceId}"`);
    return NextResponse.json(
      { error: `Servicio no encontrado: "${rawServiceId}"` },
      { status: 400 }
    );
  }

  console.log(`[schedule/appointment] Creando cita: userId=${userId} serviceId=${resolvedServiceId} (raw="${rawServiceId}") startTime=${startTime}`);

  const result = await createAppointment({
    userId,
    serviceId: resolvedServiceId,
    pushName,
    phone,
    instanceName,
    startTime,
    endTime,
    timezone,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(
    { success: true, message: result.message, appointment: result.data },
    { status: 201 }
  );
}
