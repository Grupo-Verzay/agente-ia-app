import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
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

  // Primero intenta coincidencia exacta insensible a mayúsculas
  const svc = await db.service.findFirst({
    where: { userId, name: { equals: serviceId, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (svc) return svc.id;

  // Fallback: coincidencia insensible a mayúsculas Y acentos (ej: "Asesoria" → "Asesoría")
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const all = await db.service.findMany({ where: { userId }, select: { id: true, name: true } });
  const match = all.find(s => normalize(s.name) === normalize(serviceId));
  return match?.id ?? null;
}

function normalizeTimeToSeconds(timeStr: string): number {
  const unitToSeconds: Record<string, number> = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
  const [unit, valueStr] = timeStr.split('-');
  const value = parseInt(valueStr);
  if (!unit || isNaN(value) || !(unit in unitToSeconds)) return 0;
  return value * unitToSeconds[unit];
}

// Convierte hora naïve-UTC (LLM guarda hora local como si fuera UTC) a UTC real
function naiveUtcToRealUtc(naiveIso: string, timezone: string): Date {
  const d = new Date(naiveIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const localStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
  return fromZonedTime(localStr, timezone);
}

function subtractSecondsFromTime(date: Date, seconds: number): string {
  const newDate = new Date(date.getTime() - seconds * 1000);
  return format(newDate, 'dd/MM/yyyy HH:mm');
}

function formatReminderMessage(template: string, pushName: string, startTime: string, timezone: string, durationMin: number): string {
  let msg = template;
  msg = msg.replace(/@client_name\b/gi, pushName);
  const startLocal = toZonedTime(naiveUtcToRealUtc(startTime, timezone), timezone);
  const dateLabel = format(startLocal, 'dd/MM/yyyy', { locale: es });
  const hourLabel = format(startLocal, 'h:mm a', { locale: es });
  msg = msg.replace(/@appointment_datetime\b/gi, `${dateLabel} ${hourLabel}.`);
  msg = msg.replace(/@appointment_duration\b/gi, `${durationMin} min`);
  return msg;
}

/**
 * Envía el mensaje de confirmación del servicio y crea los seguimientos programados.
 * Fire-and-forget: no bloquea la respuesta si falla.
 */
async function runPostAppointmentTasks({
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
  const [service, instance, user, reminders, notificationContacts] = await Promise.all([
    db.service.findFirst({ where: { id: serviceId }, select: { messageText: true, name: true } }),
    db.instancia.findFirst({ where: { userId, instanceName }, select: { instanceId: true } }),
    db.user.findUnique({ where: { id: userId }, select: { meetingDuration: true, apiKeyId: true, notificationNumber: true } }),
    db.reminders.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    db.userNotificationContact.findMany({ where: { userId }, select: { phone: true } }).catch(() => []),
  ]);

  const apiKey = user?.apiKeyId
    ? await db.apiKey.findUnique({ where: { id: user.apiKeyId }, select: { url: true } })
    : null;

  console.log(`[schedule/notification] messageText=${!!service?.messageText} apiKey=${!!apiKey?.url} instance=${!!instance?.instanceId} apiKeyId=${user?.apiKeyId ?? 'null'} reminders=${reminders.length}`);

  if (!apiKey?.url || !instance?.instanceId) {
    console.warn(`[schedule/notification] Sin apiKey o instancia — abortando tareas post-cita`);
    return;
  }

  const slotDuration = user?.meetingDuration ?? 60;
  const rawUrl = apiKey.url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const serverUrl = `https://${rawUrl}`;
  const sendTextUrl = `${serverUrl}/message/sendText/${instanceName}`;
  const instanceId = instance.instanceId;

  // 1. Enviar mensaje de confirmación del servicio al cliente
  if (service?.messageText) {
    let message = service.messageText;
    message = formatReminderMessage(message, pushName, startTime, timezone, slotDuration);

    const result = await sendMessageWithHistoryAction({
      instanceName,
      url: sendTextUrl,
      apikey: instanceId,
      remoteJid: phone,
      message,
      historyType: 'notification',
      additionalKwargs: { source: 'ScheduleApiAgent', recipient: 'client', serviceId },
    });

    if (result.success) {
      console.log(`[schedule/notification] Mensaje de servicio enviado a ${phone}`);
    } else {
      console.warn(`[schedule/notification] No se pudo enviar mensaje de servicio: ${result.message}`);
    }
  } else {
    console.log(`[schedule/notification] Servicio sin messageText — se omite mensaje de confirmación`);
  }

  // 2. Notificar al asesor/dueño (igual que el flujo público)
  const ownerPhones: string[] = [];
  if (user?.notificationNumber) ownerPhones.push(user.notificationNumber);
  for (const c of notificationContacts) {
    if (!ownerPhones.includes(c.phone)) ownerPhones.push(c.phone);
  }

  if (ownerPhones.length > 0) {
    const ownerStartLocal = toZonedTime(naiveUtcToRealUtc(startTime, timezone), timezone);
    const dateLabel = format(ownerStartLocal, "d 'de' MMMM 'de' yyyy", { locale: es });
    const hourLabel = format(ownerStartLocal, 'hh:mm a', { locale: es });
    const serviceName = service?.name ?? 'Asesoría';
    const clientPhone = phone.replace(/@s\.whatsapp\.net$/, '');

    const ownerText =
      `📅 *Tienes Nueva Cita*:\n\n` +
      `👤 *Nombre:* ${pushName}\n` +
      `📝 *Descripción ${serviceName}:* Para el día ${dateLabel} a las ${hourLabel}.\n\n` +
      `📱 *WhatsApp del usuario:*\n\n` +
      `👉 ${clientPhone}`;

    await Promise.allSettled(
      ownerPhones.map(async (ownerPhone) => {
        const ownerJid = ownerPhone.includes('@s.whatsapp.net')
          ? ownerPhone
          : `${ownerPhone}@s.whatsapp.net`;
        const result = await sendMessageWithHistoryAction({
          instanceName,
          url: sendTextUrl,
          apikey: instanceId,
          remoteJid: ownerJid,
          message: ownerText,
          historyType: 'notification',
          additionalKwargs: { source: 'ScheduleApiAgent', recipient: 'owner', serviceId },
        });
        if (result.success) {
          console.log(`[schedule/notification] Notificación al asesor enviada a ${ownerPhone}`);
        } else {
          console.warn(`[schedule/notification] No se pudo notificar al asesor en ${ownerPhone}: ${result.message}`);
        }
      }),
    );
  } else {
    console.log(`[schedule/notification] Sin número de notificación configurado para userId=${userId}`);
  }

  // 3. Crear seguimientos programados (igual que el flujo público)
  if (reminders.length === 0) {
    console.log(`[schedule/notification] Sin recordatorios configurados para userId=${userId}`);
    return;
  }

  const startLocal = toZonedTime(naiveUtcToRealUtc(startTime, timezone), timezone);

  const seguimientosCreados = await Promise.allSettled(
    reminders.map(async (rem) => {
      const normalizedSeconds = normalizeTimeToSeconds(rem.time ?? '');
      if (!normalizedSeconds) return;

      const seguimientoTime = subtractSecondsFromTime(startLocal, normalizedSeconds);
      const mensaje = formatReminderMessage(rem.description ?? rem.title, pushName, startTime, timezone, slotDuration);

      await db.seguimiento.create({
        data: {
          idNodo: '',
          serverurl: serverUrl,
          instancia: instanceName,
          apikey: instanceId,
          remoteJid: phone,
          mensaje,
          tipo: 'text',
          time: seguimientoTime,
        },
      });

      console.log(`[schedule/notification] Seguimiento creado para ${phone} en ${seguimientoTime}`);
    })
  );

  const errors = seguimientosCreados.filter(r => r.status === 'rejected');
  if (errors.length > 0) {
    console.error(`[schedule/notification] ${errors.length} seguimiento(s) fallaron`);
  }
}

/**
 * POST /api/schedule/appointment
 *
 * Crea una cita desde el agente IA, envía el mensaje del servicio y crea seguimientos.
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

  // Tareas post-creación: mensaje de confirmación + seguimientos (fire-and-forget)
  runPostAppointmentTasks({
    userId,
    instanceName,
    phone,
    pushName,
    startTime,
    endTime,
    timezone,
    serviceId: resolvedServiceId,
  }).catch(err => console.error('[schedule/appointment] Error en tareas post-cita:', err));

  return NextResponse.json(
    { success: true, message: result.message, appointment: result.data },
    { status: 201 }
  );
}
