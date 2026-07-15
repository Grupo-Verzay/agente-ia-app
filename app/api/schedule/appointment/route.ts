import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { db } from '@/lib/db';
import { getTimezoneFromPhone } from '@/lib/timezones';
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

  // Primero intenta coincidencia exacta insensible a mayÃºsculas
  const svc = await db.service.findFirst({
    where: { userId, name: { equals: serviceId, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (svc) return svc.id;

  // Normaliza: quita acentos, minÃºsculas, convierte slugs (guiones/guiones_bajos â†’ espacios)
  // Cubre el caso donde el LLM inventa "acido_hialuronico" o "botox" en vez del UUID real
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[_-]+/g, ' ').trim();

  const all = await db.service.findMany({ where: { userId }, select: { id: true, name: true } });
  const normalizedInput = normalize(serviceId);

  // 1. Match exacto normalizado (nombre del servicio == slug enviado)
  const exact = all.find(s => normalize(s.name) === normalizedInput);
  if (exact) return exact.id;

  // 2. El nombre del servicio empieza con el slug (ej: "botox" â†’ "Botox Facial")
  const startsWith = all.find(s => normalize(s.name).startsWith(normalizedInput + ' '));
  if (startsWith) return startsWith.id;

  // 3. El slug empieza con el nombre del servicio (ej: "acido_hialuronico_labios" â†’ "Ãcido HialurÃ³nico")
  const nameIsPrefix = all.find(s => normalizedInput.startsWith(normalize(s.name) + ' '));
  if (nameIsPrefix) return nameIsPrefix.id;

  return null;
}

function normalizeTimeToSeconds(timeStr: string): number {
  const unitToSeconds: Record<string, number> = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
  const [unit, valueStr] = (timeStr ?? '').split('-');
  const value = parseInt(valueStr, 10);
  if (unit in unitToSeconds && !isNaN(value)) return value * unitToSeconds[unit];
  // Fallback: nÃºmero plano guardado directamente como segundos (formato legacy)
  const raw = parseInt(timeStr, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function tzCityLabel(tz: string): string {
  const parts = tz.split('/');
  return (parts[parts.length - 1] ?? tz).replace(/_/g, ' ');
}

function subtractSecondsFromTime(date: Date, seconds: number): string {
  const newDate = new Date(date.getTime() - seconds * 1000);
  return newDate.toISOString();
}

function formatReminderMessage(
  template: string,
  pushName: string,
  startTime: string,
  advisorTimezone: string,
  durationMin: number,
  clientTimezone?: string,
  serviceName: string = '',
): string {
  const displayTz = clientTimezone ?? advisorTimezone;
  let msg = template;
  msg = msg.replace(/@client_name\b/gi, pushName);
  msg = msg.replace(/@service_name\b/gi, serviceName);
  const startLocal = toZonedTime(new Date(startTime), displayTz);
  const dateLabel = format(startLocal, 'dd/MM/yyyy', { locale: es });
  const hourLabel = format(startLocal, 'h:mm a', { locale: es });
  const tzLabel = tzCityLabel(displayTz);
  msg = msg.replace(/@appointment_datetime\b/gi, `${dateLabel} ${hourLabel} (hora ${tzLabel}).`);
  msg = msg.replace(/@appointment_duration\b/gi, `${durationMin} min`);
  return msg;
}

/**
 * EnvÃ­a el mensaje de confirmaciÃ³n del servicio y crea los seguimientos programados.
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
    db.instancia.findFirst({
      where: { userId, instanceName },
      select: { instanceId: true, instanceType: true, metaPhoneNumberId: true, metaAccessToken: true },
    }),
    db.user.findUnique({ where: { id: userId }, select: { meetingDuration: true, apiKeyId: true, notificationNumber: true } }),
    db.reminders.findMany({ where: { userId, isSchedule: true }, orderBy: { id: 'asc' } }),
    db.userNotificationContact.findMany({ where: { userId }, select: { phone: true } }).catch(() => []),
  ]);

  const apiKey = user?.apiKeyId
    ? await db.apiKey.findUnique({ where: { id: user.apiKeyId }, select: { url: true, key: true } })
    : null;

  console.log(`[schedule/notification] messageText=${!!service?.messageText} apiKey=${!!apiKey?.url} instance=${!!instance?.instanceId} apiKeyId=${user?.apiKeyId ?? 'null'} reminders=${reminders.length}`);

  if (!instance?.instanceId) {
    console.warn(`[schedule/notification] Sin apiKey (url+key) o instancia â€” abortando tareas post-cita`);
    return;
  }

  const slotDuration = user?.meetingDuration ?? 60;
  const rawUrl = apiKey?.url?.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const isMetaInstance = String(instance.instanceType ?? '').toLowerCase() === 'meta';
  const serverUrl = isMetaInstance
    ? (instance.metaPhoneNumberId || instance.instanceId)
    : rawUrl ? `https://${rawUrl}` : '';
  const sendTextUrl = serverUrl ? `${serverUrl}/message/sendText/${instanceName}` : undefined;
  const evolutionApiKey = isMetaInstance
    ? (instance.metaAccessToken || apiKey?.key || instance.instanceId)
    : (apiKey?.key ?? instance.instanceId);

  // Detectar timezone del cliente por cÃ³digo de paÃ­s del telÃ©fono
  const clientTimezone = getTimezoneFromPhone(phone, timezone);

  // 1. ConfirmaciÃ³n del servicio al cliente via seguimiento (mismo mecanismo que confirm-appointment)
  // Usa el mensaje del servicio si estÃ¡ configurado; de lo contrario, envÃ­a un mensaje genÃ©rico.
  const confirmRawText = service?.messageText?.trim()
    || `ðŸ“ Â¡Tu cita ha sido registrada! Un asesor se pondrÃ¡ en contacto contigo a la brevedad.`;
  const confirmMessage = formatReminderMessage(confirmRawText, pushName, startTime, timezone, slotDuration, clientTimezone, service?.name ?? '');
  const clientJid = phone.includes('@s.whatsapp.net')
    ? phone
    : `${phone.replace(/\D/g, '')}@s.whatsapp.net`;

  await sendMessageWithHistoryAction({
    instanceName,
    url: sendTextUrl,
    apikey: evolutionApiKey,
    remoteJid: clientJid,
    message: confirmMessage,
    historyType: 'notification',
    additionalKwargs: { source: 'ScheduleApiAgent', recipient: 'client', serviceId },
  }).then((result) => {
    if (result.success) {
      console.log(`[schedule/notification] Confirmación enviada al cliente ${clientJid}`);
    } else {
      console.warn(`[schedule/notification] No se pudo enviar confirmación al cliente ${clientJid}: ${result.message}`);
    }
  }).catch(err => {
    console.error(`[schedule/notification] Error enviando confirmación al cliente: ${err}`);
  });

  // 2. Notificar al asesor/dueÃ±o (igual que el flujo pÃºblico)
  const ownerPhones: string[] = [];
  if (user?.notificationNumber) ownerPhones.push(user.notificationNumber);
  for (const c of notificationContacts) {
    if (!ownerPhones.includes(c.phone)) ownerPhones.push(c.phone);
  }

  if (ownerPhones.length > 0) {
    const ownerStartLocal = toZonedTime(new Date(startTime), timezone);
    const dateLabel = format(ownerStartLocal, "d 'de' MMMM 'de' yyyy", { locale: es });
    const hourLabel = format(ownerStartLocal, 'hh:mm a', { locale: es });
    const tzLabel = tzCityLabel(timezone);
    const serviceName = service?.name ?? 'AsesorÃ­a';
    const clientPhone = phone.replace(/@s\.whatsapp\.net$/, '');

    const ownerText =
      `ðŸ“… *Tienes Nueva Cita*:\n\n` +
      `ðŸ‘¤ *Nombre:* ${pushName}\n` +
      `ðŸ“ *DescripciÃ³n ${serviceName}:* Para el dÃ­a ${dateLabel} a las ${hourLabel} (hora ${tzLabel}).\n\n` +
      `ðŸ“± *WhatsApp del usuario:*\n\n` +
      `ðŸ‘‰ ${clientPhone}`;

    await Promise.allSettled(
      ownerPhones.map(async (ownerPhone) => {
        const ownerJid = ownerPhone.includes('@s.whatsapp.net')
          ? ownerPhone
          : `${ownerPhone}@s.whatsapp.net`;
        const result = await sendMessageWithHistoryAction({
          instanceName,
          url: sendTextUrl,
          apikey: evolutionApiKey,
          remoteJid: ownerJid,
          message: ownerText,
          historyType: 'notification',
          additionalKwargs: { source: 'ScheduleApiAgent', recipient: 'owner', serviceId },
        });
        if (result.success) {
          console.log(`[schedule/notification] NotificaciÃ³n al asesor enviada a ${ownerPhone}`);
        } else {
          console.warn(`[schedule/notification] No se pudo notificar al asesor en ${ownerPhone}: ${result.message}`);
        }
      }),
    );
  } else {
    console.log(`[schedule/notification] Sin nÃºmero de notificaciÃ³n configurado para userId=${userId}`);
  }

  // 3. Crear seguimientos programados (igual que el flujo pÃºblico)
  if (reminders.length === 0) {
    console.log(`[schedule/notification] Sin recordatorios configurados para userId=${userId}`);
    return;
  }

  const seguimientosCreados = await Promise.allSettled(
    reminders.map(async (rem) => {
      const normalizedSeconds = normalizeTimeToSeconds(rem.time ?? '');
      console.log(`[REMINDER_DEBUG] rem.time: "${rem.time}" | normalizedSeconds: ${normalizedSeconds} | startTime: ${startTime}`);
      if (!normalizedSeconds) return;

      const reminderDate = new Date(new Date(startTime).getTime() - normalizedSeconds * 1000);
      console.log(`[REMINDER_DEBUG] reminderDate UTC: ${reminderDate.toISOString()} | seguimientoTime guardado: "${subtractSecondsFromTime(new Date(startTime), normalizedSeconds)}"`);

      if (reminderDate.getTime() <= Date.now()) {
        console.log(`[REMINDER_DEBUG] Recordatorio vencido al crear cita, omitiendo: ${reminderDate.toISOString()}`);
        return;
      }

      const seguimientoTime = subtractSecondsFromTime(new Date(startTime), normalizedSeconds);
      const mensaje = formatReminderMessage(rem.description ?? rem.title, pushName, startTime, timezone, slotDuration, clientTimezone);

      await db.seguimiento.create({
        data: {
          idNodo: `appt-reminder-${rem.id}`,
          serverurl: serverUrl,
          instancia: instanceName,
          apikey: evolutionApiKey,
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
 * Crea una cita desde el agente IA, envÃ­a el mensaje del servicio y crea seguimientos.
 * serviceId puede ser UUID, nombre o Ã­ndice numÃ©rico 1-based.
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

  const { userId, serviceId: rawServiceId, pushName, phone, instanceName, startTime: rawStartTime, endTime: rawEndTime, timezone } = body;

  if (!userId || !rawServiceId || !pushName || !phone || !instanceName || !rawStartTime || !rawEndTime || !timezone) {
    return NextResponse.json(
      { error: 'Missing required fields: userId, serviceId, pushName, phone, instanceName, startTime, endTime, timezone' },
      { status: 400 }
    );
  }

  // Asegurar que startTime/endTime siempre sean UTC.
  // Si el LLM envÃ­a la string sin Z (ej: "2025-10-17T21:00:00"), Node.js la interpreta como hora
  // local del servidor (America/Bogota, UTC-5), desplazando todos los cÃ¡lculos 5 horas.
  const utcSuffix = /Z$|\+\d{2}:\d{2}$|-\d{2}:\d{2}$/.test(rawStartTime);
  const startTime = utcSuffix ? rawStartTime : rawStartTime + 'Z';
  const endTime = /Z$|\+\d{2}:\d{2}$|-\d{2}:\d{2}$/.test(rawEndTime) ? rawEndTime : rawEndTime + 'Z';

  console.log(`[schedule/appointment] startTime normalizado: "${rawStartTime}" â†’ "${startTime}"`);

  const resolvedServiceId = await resolveServiceId(userId, rawServiceId);
  if (!resolvedServiceId) {
    console.error(`[schedule/appointment] Servicio no encontrado: userId=${userId} serviceId="${rawServiceId}"`);
    return NextResponse.json(
      { error: `Servicio no encontrado: "${rawServiceId}"` },
      { status: 400 }
    );
  }

  console.log(`[schedule/appointment] Creando cita: userId=${userId} serviceId=${resolvedServiceId} startTime=${startTime} (raw="${rawStartTime}") tz=${timezone}`);

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

  // Tareas post-creaciÃ³n: mensaje de confirmaciÃ³n + seguimientos (fire-and-forget)
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
