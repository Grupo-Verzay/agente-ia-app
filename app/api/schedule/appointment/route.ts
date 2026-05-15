import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
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
  const [unit, valueStr] = (timeStr ?? '').split('-');
  const value = parseInt(valueStr, 10);
  if (unit in unitToSeconds && !isNaN(value)) return value * unitToSeconds[unit];
  // Fallback: número plano guardado directamente como segundos (formato legacy)
  const raw = parseInt(timeStr, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

// ─── Detección automática de timezone por código de país ─────────────────────
// Ordenado de prefijos más largos a más cortos para evitar coincidencias parciales
const COUNTRY_TZ_MAP: [string, string][] = [
  // ── América (3 dígitos) ────────────────────────────────────────────────────
  ['598', 'America/Montevideo'],              // Uruguay
  ['597', 'America/Paramaribo'],             // Suriname
  ['595', 'America/Asuncion'],               // Paraguay
  ['593', 'America/Guayaquil'],              // Ecuador
  ['592', 'America/Guyana'],                 // Guyana
  ['591', 'America/La_Paz'],                 // Bolivia
  ['509', 'America/Port-au-Prince'],         // Haití
  ['507', 'America/Panama'],                 // Panamá
  ['506', 'America/Costa_Rica'],             // Costa Rica
  ['505', 'America/Managua'],                // Nicaragua
  ['504', 'America/Tegucigalpa'],            // Honduras
  ['503', 'America/El_Salvador'],            // El Salvador
  ['502', 'America/Guatemala'],              // Guatemala
  // ── Europa (3 dígitos) ────────────────────────────────────────────────────
  ['421', 'Europe/Bratislava'],              // Eslovaquia
  ['420', 'Europe/Prague'],                  // República Checa
  ['385', 'Europe/Zagreb'],                  // Croacia
  ['381', 'Europe/Belgrade'],                // Serbia
  ['380', 'Europe/Kiev'],                    // Ucrania
  ['372', 'Europe/Tallinn'],                 // Estonia
  ['371', 'Europe/Riga'],                    // Letonia
  ['370', 'Europe/Vilnius'],                 // Lituania
  ['358', 'Europe/Helsinki'],                // Finlandia
  ['353', 'Europe/Dublin'],                  // Irlanda
  ['352', 'Europe/Luxembourg'],              // Luxemburgo
  ['351', 'Europe/Lisbon'],                  // Portugal
  // ── Oriente Medio (3 dígitos) ─────────────────────────────────────────────
  ['974', 'Asia/Qatar'],                     // Qatar
  ['973', 'Asia/Bahrain'],                   // Bahréin
  ['972', 'Asia/Jerusalem'],                 // Israel
  ['971', 'Asia/Dubai'],                     // Emiratos Árabes
  ['968', 'Asia/Muscat'],                    // Omán
  ['966', 'Asia/Riyadh'],                    // Arabia Saudita
  ['965', 'Asia/Kuwait'],                    // Kuwait
  ['964', 'Asia/Baghdad'],                   // Iraq
  ['962', 'Asia/Amman'],                     // Jordania
  ['961', 'Asia/Beirut'],                    // Líbano
  // ── Asia Central (3 dígitos) ──────────────────────────────────────────────
  ['998', 'Asia/Tashkent'],                  // Uzbekistán
  ['996', 'Asia/Bishkek'],                   // Kirguistán
  ['995', 'Asia/Tbilisi'],                   // Georgia
  ['994', 'Asia/Baku'],                      // Azerbaiyán
  ['993', 'Asia/Ashgabat'],                  // Turkmenistán
  ['992', 'Asia/Dushanbe'],                  // Tayikistán
  ['977', 'Asia/Kathmandu'],                 // Nepal
  ['880', 'Asia/Dhaka'],                     // Bangladesh
  ['856', 'Asia/Vientiane'],                 // Laos
  ['855', 'Asia/Phnom_Penh'],                // Camboya
  ['852', 'Asia/Hong_Kong'],                 // Hong Kong
  // ── África (3 dígitos) ────────────────────────────────────────────────────
  ['267', 'Africa/Gaborone'],                // Botsuana
  ['266', 'Africa/Maseru'],                  // Lesoto
  ['265', 'Africa/Blantyre'],                // Malaui
  ['264', 'Africa/Windhoek'],                // Namibia
  ['263', 'Africa/Harare'],                  // Zimbabue
  ['260', 'Africa/Lusaka'],                  // Zambia
  ['256', 'Africa/Kampala'],                 // Uganda
  ['255', 'Africa/Dar_es_Salaam'],           // Tanzania
  ['254', 'Africa/Nairobi'],                 // Kenia
  ['251', 'Africa/Addis_Ababa'],             // Etiopía
  ['250', 'Africa/Kigali'],                  // Ruanda
  ['249', 'Africa/Khartoum'],                // Sudán
  ['244', 'Africa/Luanda'],                  // Angola
  ['243', 'Africa/Kinshasa'],                // RD Congo
  ['237', 'Africa/Douala'],                  // Camerún
  ['234', 'Africa/Lagos'],                   // Nigeria
  ['233', 'Africa/Accra'],                   // Ghana
  ['225', 'Africa/Abidjan'],                 // Costa de Marfil
  ['221', 'Africa/Dakar'],                   // Senegal
  ['218', 'Africa/Tripoli'],                 // Libia
  ['216', 'Africa/Tunis'],                   // Túnez
  ['213', 'Africa/Algiers'],                 // Argelia
  ['212', 'Africa/Casablanca'],              // Marruecos
  // ── América del Sur (2 dígitos) ───────────────────────────────────────────
  ['58',  'America/Caracas'],                // Venezuela
  ['57',  'America/Bogota'],                 // Colombia
  ['56',  'America/Santiago'],               // Chile
  ['55',  'America/Sao_Paulo'],              // Brasil
  ['54',  'America/Argentina/Buenos_Aires'], // Argentina
  ['53',  'America/Havana'],                 // Cuba
  ['52',  'America/Mexico_City'],            // México
  ['51',  'America/Lima'],                   // Perú
  // ── Europa (2 dígitos) ────────────────────────────────────────────────────
  ['49',  'Europe/Berlin'],                  // Alemania
  ['48',  'Europe/Warsaw'],                  // Polonia
  ['47',  'Europe/Oslo'],                    // Noruega
  ['46',  'Europe/Stockholm'],               // Suecia
  ['45',  'Europe/Copenhagen'],              // Dinamarca
  ['44',  'Europe/London'],                  // Reino Unido
  ['43',  'Europe/Vienna'],                  // Austria
  ['41',  'Europe/Zurich'],                  // Suiza
  ['40',  'Europe/Bucharest'],               // Rumanía
  ['39',  'Europe/Rome'],                    // Italia
  ['36',  'Europe/Budapest'],                // Hungría
  ['34',  'Europe/Madrid'],                  // España
  ['33',  'Europe/Paris'],                   // Francia
  ['32',  'Europe/Brussels'],                // Bélgica
  ['31',  'Europe/Amsterdam'],               // Países Bajos
  ['30',  'Europe/Athens'],                  // Grecia
  // ── África (2 dígitos) ────────────────────────────────────────────────────
  ['27',  'Africa/Johannesburg'],            // Sudáfrica
  ['20',  'Africa/Cairo'],                   // Egipto
  // ── Asia / Oceanía (2 dígitos) ────────────────────────────────────────────
  ['94',  'Asia/Colombo'],                   // Sri Lanka
  ['92',  'Asia/Karachi'],                   // Pakistán
  ['91',  'Asia/Kolkata'],                   // India
  ['90',  'Europe/Istanbul'],                // Turquía
  ['86',  'Asia/Shanghai'],                  // China
  ['84',  'Asia/Ho_Chi_Minh'],               // Vietnam
  ['82',  'Asia/Seoul'],                     // Corea del Sur
  ['81',  'Asia/Tokyo'],                     // Japón
  ['66',  'Asia/Bangkok'],                   // Tailandia
  ['65',  'Asia/Singapore'],                 // Singapur
  ['64',  'Pacific/Auckland'],               // Nueva Zelanda
  ['63',  'Asia/Manila'],                    // Filipinas
  ['62',  'Asia/Jakarta'],                   // Indonesia
  ['61',  'Australia/Sydney'],               // Australia
  ['60',  'Asia/Kuala_Lumpur'],              // Malasia
  // ── 1 dígito (siempre al final) ───────────────────────────────────────────
  ['7',   'Europe/Moscow'],                  // Rusia / Kazajistán
  ['1',   'America/New_York'],               // EE.UU. / Canadá
];

function getClientTimezone(remoteJid: string, fallback: string): string {
  const digits = (remoteJid ?? '').split('@')[0].replace(/\D/g, '');
  for (const [prefix, tz] of COUNTRY_TZ_MAP) {
    if (digits.startsWith(prefix)) return tz;
  }
  return fallback;
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
): string {
  const displayTz = clientTimezone ?? advisorTimezone;
  let msg = template;
  msg = msg.replace(/@client_name\b/gi, pushName);
  const startLocal = toZonedTime(new Date(startTime), displayTz);
  const dateLabel = format(startLocal, 'dd/MM/yyyy', { locale: es });
  const hourLabel = format(startLocal, 'h:mm a', { locale: es });
  const tzLabel = tzCityLabel(displayTz);
  msg = msg.replace(/@appointment_datetime\b/gi, `${dateLabel} ${hourLabel} (hora ${tzLabel}).`);
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
    db.reminders.findMany({ where: { userId, isSchedule: true }, orderBy: { id: 'asc' } }),
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

  // Detectar timezone del cliente por código de país del teléfono
  const clientTimezone = getClientTimezone(phone, timezone);

  // 1. Confirmación del servicio al cliente via seguimiento (mismo mecanismo que confirm-appointment)
  if (service?.messageText) {
    const confirmMessage = formatReminderMessage(service.messageText, pushName, startTime, timezone, slotDuration, clientTimezone);
    db.seguimiento.create({
      data: {
        idNodo: '',
        serverurl: serverUrl,
        instancia: instanceName,
        apikey: instanceId,
        remoteJid: phone,
        mensaje: confirmMessage,
        tipo: 'text',
        time: '10',
      },
    }).then(() => {
      console.log(`[schedule/notification] Seguimiento de confirmación creado para ${phone}`);
    }).catch(err => {
      console.error(`[schedule/notification] Error creando seguimiento de confirmación: ${err}`);
    });
  }

  // 2. Notificar al asesor/dueño (igual que el flujo público)
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
    const serviceName = service?.name ?? 'Asesoría';
    const clientPhone = phone.replace(/@s\.whatsapp\.net$/, '');

    const ownerText =
      `📅 *Tienes Nueva Cita*:\n\n` +
      `👤 *Nombre:* ${pushName}\n` +
      `📝 *Descripción ${serviceName}:* Para el día ${dateLabel} a las ${hourLabel} (hora ${tzLabel}).\n\n` +
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

  const { userId, serviceId: rawServiceId, pushName, phone, instanceName, startTime: rawStartTime, endTime: rawEndTime, timezone } = body;

  if (!userId || !rawServiceId || !pushName || !phone || !instanceName || !rawStartTime || !rawEndTime || !timezone) {
    return NextResponse.json(
      { error: 'Missing required fields: userId, serviceId, pushName, phone, instanceName, startTime, endTime, timezone' },
      { status: 400 }
    );
  }

  // Asegurar que startTime/endTime siempre sean UTC.
  // Si el LLM envía la string sin Z (ej: "2025-10-17T21:00:00"), Node.js la interpreta como hora
  // local del servidor (America/Bogota, UTC-5), desplazando todos los cálculos 5 horas.
  const utcSuffix = /Z$|\+\d{2}:\d{2}$|-\d{2}:\d{2}$/.test(rawStartTime);
  const startTime = utcSuffix ? rawStartTime : rawStartTime + 'Z';
  const endTime = /Z$|\+\d{2}:\d{2}$|-\d{2}:\d{2}$/.test(rawEndTime) ? rawEndTime : rawEndTime + 'Z';

  console.log(`[schedule/appointment] startTime normalizado: "${rawStartTime}" → "${startTime}"`);

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
