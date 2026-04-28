import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { db } from '@/lib/db';
import { createAppointment } from '@/actions/appointments-actions';
import { sendMessageWithHistoryAction } from '@/actions/chat-history/send-message-with-history-action';

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

async function resolveServiceId(userId: string, serviceId: string): Promise<string | null> {
  if (UUID_RE.test(serviceId)) {
    const svc = await db.service.findFirst({ where: { id: serviceId, userId }, select: { id: true } });
    return svc?.id ?? null;
  }

  const idx = parseInt(serviceId, 10);
  if (!isNaN(idx) && idx >= 1) {
    const all = await db.service.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return all[idx - 1]?.id ?? null;
  }

  const svc = await db.service.findFirst({
    where: { userId, name: { equals: serviceId, mode: 'insensitive' } },
    select: { id: true },
  });
  return svc?.id ?? null;
}

/**
 * Envía el mensaje automático del servicio al cliente (igual que el flujo público).
 * Fire-and-forget: no bloquea la respuesta si falla.
 */
async function sendServiceNotification({
  userId,
  instanceName,
  phone,
  pushName,
  startTime,
  endTime,
  timezone,
  serviceId,
}: {
  userId: string;
  instanceName: string;
  phone: string;
  pushName: string;
  startTime: string;
  endTime: string;
  timezone: string;
  serviceId: string;
}) {
  const [service, instance, user] = await Promise.all([
    db.service.findFirst({ where: { id: serviceId }, select: { messageText: true } }),
    db.instancia.findFirst({ where: { userId, instanceName }, select: { instanceId: true } }),
    db.user.findUnique({ where: { id: userId }, select: { meetingDuration: true, apiKeyId: true } }),
  ]);

  const apiKey = user?.apiKeyId
    ? await db.apiKey.findUnique({ where: { id: user.apiKeyId }, select: { url: true } })
    : null;

  if (!service?.messageText || !apiKey?.url || !instance?.instanceId) return;

  // Formatear las variables del mensaje
  const startDate = new Date(startTime);
  const localTime = toZonedTime(startDate, timezone);
  const dateLabel = format(localTime, "dd/MM/yyyy", { locale: es });
  const hourLabel = format(localTime, "h:mm a", { locale: es });

  let message = service.messageText;
  message = message.replace(/@client_name\b/gi, pushName);
  message = message.replace(/@appointment_datetime\b/gi, `${dateLabel} ${hourLabel}.`);
  message = message.replace(/@appointment_duration\b/gi, `${user?.meetingDuration ?? 60} min`);

  await sendMessageWithHistoryAction({
    instanceName,
    url: apiKey.url,
    apikey: instance.instanceId,
    remoteJid: phone,
    message,
    historyType: 'notification',
    additionalKwargs: {
      source: 'ScheduleApiAgent',
      recipient: 'client',
      serviceId,
    },
  });

  console.log(`[schedule/appointment] Mensaje de servicio enviado a ${phone}`);
}

/**
 * POST /api/schedule/appointment
 *
 * Crea una cita desde el agente IA y envía el mensaje automático del servicio.
 * serviceId puede ser UUID, nombre o índice numérico 1-based.
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

  console.log(`[schedule/appointment] Creando cita: userId=${userId} serviceId=${resolvedServiceId} startTime=${startTime} tz=${timezone}`);

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

  // Enviar mensaje automático del servicio (fire-and-forget, no bloquea la respuesta)
  sendServiceNotification({
    userId,
    instanceName,
    phone,
    pushName,
    startTime,
    endTime,
    timezone,
    serviceId: resolvedServiceId,
  }).catch(err => console.error('[schedule/appointment] Error en notificación de servicio:', err));

  return NextResponse.json(
    { success: true, message: result.message, appointment: result.data },
    { status: 201 }
  );
}
