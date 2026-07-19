import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { db } from '@/lib/db';
import { getTimezoneFromPhone } from '@/lib/timezones';
import { createBookingAppointment } from '@/actions/bookings-actions';
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

function tzCityLabel(tz: string): string {
  const parts = tz.split('/');
  return (parts[parts.length - 1] ?? tz).replace(/_/g, ' ');
}

function normalizeTimeToSeconds(timeStr: string): number {
  const unitToSeconds: Record<string, number> = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
  const [unit, valueStr] = (timeStr ?? '').split('-');
  const value = parseInt(valueStr, 10);
  if (unit in unitToSeconds && !isNaN(value)) return value * unitToSeconds[unit];
  const raw = parseInt(timeStr, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function subtractSecondsFromTime(date: Date, seconds: number): string {
  return new Date(date.getTime() - seconds * 1000).toISOString();
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

async function runPostBookingTasks({
  userId,
  instanceName,
  phone,
  pushName,
  startTime,
  endTime,
  timezone,
  serviceId,
  memberId,
}: {
  userId: string;
  instanceName: string;
  phone: string;
  pushName: string;
  startTime: string;
  endTime: string;
  timezone: string;
  serviceId: string;
  memberId: string;
}) {
  const [service, member, instance, user, globalReminders, notificationContacts] = await Promise.all([
    db.teamService.findFirst({
      where: { id: serviceId },
      select: { messageText: true, name: true, duration: true, remindersConfig: true },
    }),
    db.teamMember.findFirst({
      where: { id: memberId },
      select: { name: true },
    }),
    db.instancia.findFirst({
      where: { userId, instanceName },
      select: { instanceId: true, instanceType: true, metaPhoneNumberId: true, metaAccessToken: true },
    }),
    db.user.findUnique({ where: { id: userId }, select: { apiKeyId: true, notificationNumber: true } }),
    db.reminders.findMany({ where: { userId, isSchedule: true }, orderBy: { id: 'asc' } }),
    db.userNotificationContact.findMany({ where: { userId }, select: { phone: true } }).catch(() => []),
  ]);

  // Usar recordatorios del servicio si estÃ¡n configurados; si no, los globales
  type ServiceReminder = { timeMinutes: number; message: string };
  const serviceReminders: ServiceReminder[] = Array.isArray(service?.remindersConfig)
    ? (service.remindersConfig as ServiceReminder[]).filter(
        (r) => typeof r?.timeMinutes === 'number' && r.timeMinutes > 0 && typeof r?.message === 'string',
      )
    : [];
  const reminders = serviceReminders.length > 0 ? null : globalReminders;

  const apiKey = user?.apiKeyId
    ? await db.apiKey.findUnique({ where: { id: user.apiKeyId }, select: { url: true, key: true } })
    : null;

  if (!instance?.instanceId) {
    console.warn(`[bookings/notification] Sin apiKey o instancia â€” abortando tareas post-cita`);
    return;
  }

  const slotDuration = service?.duration ?? 60;
  const rawUrl = apiKey?.url?.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const isMetaInstance = String(instance.instanceType ?? '').toLowerCase() === 'meta';
  const serverUrl = isMetaInstance
    ? (instance.metaPhoneNumberId || instance.instanceId)
    : rawUrl ? `https://${rawUrl}` : '';
  const sendTextUrl = serverUrl ? `${serverUrl}/message/sendText/${instanceName}` : undefined;
  const evolutionApiKey = isMetaInstance
    ? (instance.metaAccessToken || apiKey?.key || instance.instanceId)
    : (apiKey?.key ?? instance.instanceId);
  const clientTimezone = getTimezoneFromPhone(phone, timezone);

  // 1. ConfirmaciÃ³n al cliente
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
    additionalKwargs: { source: 'BookingsApiAgent', recipient: 'client', serviceId },
  }).then((result) => {
    if (result.success) {
      console.log(`[bookings/notification] Confirmación enviada al cliente ${clientJid}`);
    } else {
      console.warn(`[bookings/notification] No se pudo enviar confirmación al cliente ${clientJid}: ${result.message}`);
    }
  }).catch((err) => console.error(`[bookings/notification] Error confirmación: ${err}`));

  // 2. Notificar al asesor/dueÃ±o
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
    const memberName = member?.name ?? '';
    const clientPhone = phone.replace(/@s\.whatsapp\.net$/, '');

    const ownerText =
      `ðŸ“… *Nueva Cita Agendada*:\n\n` +
      `ðŸ‘¤ *Cliente:* ${pushName}\n` +
      `ðŸ“ *Servicio:* ${serviceName}\n` +
      (memberName ? `ðŸ§‘â€ðŸ’¼ *Especialista:* ${memberName}\n` : '') +
      `ðŸ“† *Fecha y hora:* ${dateLabel} a las ${hourLabel} (hora ${tzLabel}).\n\n` +
      `ðŸ“± *WhatsApp del cliente:*\n\n` +
      `ðŸ‘‰ ${clientPhone}`;

    await Promise.allSettled(
      ownerPhones.map(async (ownerPhone) => {
        const ownerJid = ownerPhone.includes('@s.whatsapp.net')
          ? ownerPhone
          : `${ownerPhone}@s.whatsapp.net`;
        await sendMessageWithHistoryAction({
          instanceName,
          url: sendTextUrl,
          apikey: evolutionApiKey,
          remoteJid: ownerJid,
          message: ownerText,
          historyType: 'notification',
          additionalKwargs: {
            source: 'BookingsApiAgent',
            recipient: 'owner',
            serviceId,
            eventType: 'Cita',
            advisorRequest: false,
            contactName: pushName,
            descriptionLabel: serviceName,
            description: `Para el día ${dateLabel} a las ${hourLabel} (hora ${tzLabel})${memberName ? ` con ${memberName}` : ''}.`,
            contactPhone: `+${clientPhone.replace(/\D/g, '')}`,
          },
        });
      }),
    );
  }

  // 3. Recordatorios programados
  if (serviceReminders.length > 0) {
    // Recordatorios especÃ­ficos del servicio
    await Promise.allSettled(
      serviceReminders.map(async (rem, idx) => {
        const seconds = rem.timeMinutes * 60;
        const reminderDate = new Date(new Date(startTime).getTime() - seconds * 1000);
        if (reminderDate.getTime() <= Date.now()) return;

        const seguimientoTime = subtractSecondsFromTime(new Date(startTime), seconds);
        const mensaje = formatReminderMessage(rem.message, pushName, startTime, timezone, slotDuration, clientTimezone, service?.name ?? '');

        await db.seguimiento.create({
          data: {
            idNodo: `booking-svc-reminder-${serviceId}-${idx}`,
            serverurl: serverUrl,
            instancia: instanceName,
            apikey: evolutionApiKey,
            remoteJid: phone,
            mensaje,
            tipo: 'text',
            time: seguimientoTime,
          },
        });
      }),
    );
  } else if (reminders && reminders.length > 0) {
    // Recordatorios globales del usuario (isSchedule: true)
    await Promise.allSettled(
      reminders.map(async (rem) => {
        const normalizedSeconds = normalizeTimeToSeconds(rem.time ?? '');
        if (!normalizedSeconds) return;

        const reminderDate = new Date(new Date(startTime).getTime() - normalizedSeconds * 1000);
        if (reminderDate.getTime() <= Date.now()) return;

        const seguimientoTime = subtractSecondsFromTime(new Date(startTime), normalizedSeconds);
        const mensaje = formatReminderMessage(rem.description ?? rem.title, pushName, startTime, timezone, slotDuration, clientTimezone);

        await db.seguimiento.create({
          data: {
            idNodo: `booking-reminder-${rem.id}`,
            serverurl: serverUrl,
            instancia: instanceName,
            apikey: evolutionApiKey,
            remoteJid: phone,
            mensaje,
            tipo: 'text',
            time: seguimientoTime,
          },
        });
      }),
    );
  }
}

/**
 * POST /api/bookings/appointment
 *
 * Crea una cita de booking desde el agente IA.
 * Body: { userId, serviceId, memberId, pushName, phone, instanceName, startTime, endTime, timezone }
 *
 * memberId: puede omitirse si solo hay un miembro disponible para el servicio;
 *           en ese caso se asigna automÃ¡ticamente el primero activo.
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

  const {
    userId,
    serviceId,
    memberId: rawMemberId,
    pushName,
    phone,
    instanceName,
    startTime: rawStartTime,
    endTime: rawEndTime,
    timezone,
  } = body;

  if (!userId || !serviceId || !pushName || !phone || !instanceName || !rawStartTime || !rawEndTime || !timezone) {
    return NextResponse.json(
      { error: 'Missing required fields: userId, serviceId, pushName, phone, instanceName, startTime, endTime, timezone' },
      { status: 400 },
    );
  }

  // Normalizar timestamps a UTC
  const startTime = /Z$|\+\d{2}:\d{2}$|-\d{2}:\d{2}$/.test(rawStartTime) ? rawStartTime : rawStartTime + 'Z';
  const endTime   = /Z$|\+\d{2}:\d{2}$|-\d{2}:\d{2}$/.test(rawEndTime)   ? rawEndTime   : rawEndTime   + 'Z';

  // Resolver team del usuario
  const team = await db.team.findUnique({
    where: { userId },
    select: { id: true, timezone: true },
  });

  if (!team) {
    return NextResponse.json({ error: 'Equipo de booking no encontrado para este usuario' }, { status: 404 });
  }

  // Resolver servicio (por UUID o nombre)
  const service = await db.teamService.findFirst({
    where: {
      teamId: team.id,
      isActive: true,
      OR: [
        { id: serviceId },
        { name: { equals: serviceId, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      members: {
        select: { teamMember: { select: { id: true, isActive: true } } },
      },
    },
  });

  if (!service) {
    return NextResponse.json({ error: `Servicio no encontrado: "${serviceId}"` }, { status: 400 });
  }

  // Resolver memberId: usar el enviado o auto-asignar el primero activo del servicio/equipo
  let resolvedMemberId = rawMemberId?.trim() || '';

  if (!resolvedMemberId) {
    const activeMembers = service.members
      .filter((m) => m.teamMember.isActive)
      .map((m) => m.teamMember.id);

    if (activeMembers.length === 0) {
      // NingÃºn miembro asignado al servicio â†’ tomar cualquier miembro activo del equipo
      const anyMember = await db.teamMember.findFirst({
        where: { teamId: team.id, isActive: true },
        select: { id: true },
      });
      resolvedMemberId = anyMember?.id ?? '';
    } else {
      resolvedMemberId = activeMembers[0];
    }
  }

  if (!resolvedMemberId) {
    return NextResponse.json({ error: 'No hay especialistas disponibles para este servicio' }, { status: 400 });
  }

  console.log(`[bookings/appointment] Creando cita: userId=${userId} serviceId=${service.id} memberId=${resolvedMemberId} startTime=${startTime} tz=${timezone}`);

  const result = await createBookingAppointment({
    teamId: team.id,
    teamMemberId: resolvedMemberId,
    teamServiceId: service.id,
    clientName: pushName,
    clientPhone: phone,
    startTime,
    endTime,
    timezone,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  // Tareas post-creaciÃ³n (fire-and-forget)
  runPostBookingTasks({
    userId,
    instanceName,
    phone,
    pushName,
    startTime,
    endTime,
    timezone,
    serviceId: service.id,
    memberId: resolvedMemberId,
  }).catch((err) => console.error('[bookings/appointment] Error en tareas post-cita:', err));

  return NextResponse.json(
    { success: true, message: result.message, appointment: result.data },
    { status: 201 },
  );
}
