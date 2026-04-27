import { NextResponse } from 'next/server';
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

/**
 * POST /api/schedule/appointment
 *
 * Crea una cita desde el agente IA. Usa la misma lógica que el flujo
 * público /schedule/[userId], por lo que disponibilidad y solapamiento
 * se validan de la misma forma.
 *
 * Body JSON:
 *   userId       — requerido
 *   serviceId    — requerido
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

  const { userId, serviceId, pushName, phone, instanceName, startTime, endTime, timezone } = body;

  if (!userId || !serviceId || !pushName || !phone || !instanceName || !startTime || !endTime || !timezone) {
    return NextResponse.json(
      { error: 'Missing required fields: userId, serviceId, pushName, phone, instanceName, startTime, endTime, timezone' },
      { status: 400 }
    );
  }

  const result = await createAppointment({
    userId,
    serviceId,
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
