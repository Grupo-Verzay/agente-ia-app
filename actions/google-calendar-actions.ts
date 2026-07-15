'use server';

import { google } from 'googleapis';
import { db } from '@/lib/db';

/* ── Service account auth ──────────────────────────────────────
 * Reutiliza la MISMA credencial de cuenta de servicio que Google Sheets
 * (GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_SHEETS_CREDENTIALS). El usuario debe
 * compartir su calendario con el email de esta cuenta de servicio dándole
 * permiso para "Hacer cambios en los eventos".
 */
function getCreds(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!raw) throw new Error('Falta la variable GOOGLE_SERVICE_ACCOUNT_JSON (o GOOGLE_SHEETS_CREDENTIALS) en el entorno');
  return JSON.parse(raw);
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCreds(),
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });
}

/** Email de la cuenta de servicio — el usuario lo necesita para compartir su calendario. */
export async function getServiceAccountEmail(): Promise<string | null> {
  try {
    const creds = getCreds();
    return (creds.client_email as string) ?? null;
  } catch {
    return null;
  }
}

/** Normaliza el ID del calendario: acepta el email/ID directo o "primary". */
function normalizeCalendarId(input: string): string {
  const v = input.trim();
  if (!v) return 'primary';
  return v;
}

/* ── DB helpers ────────────────────────────────────────────── */
export interface GoogleCalendarConfig {
  calendarId: string | null;
  enabled: boolean;
  serviceAccountEmail: string | null;
}

export async function getGoogleCalendarConfig(userId: string): Promise<GoogleCalendarConfig> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { googleCalendarId: true, googleCalendarSyncEnabled: true } as any,
  });
  return {
    calendarId: (user as any)?.googleCalendarId ?? null,
    enabled: (user as any)?.googleCalendarSyncEnabled ?? false,
    serviceAccountEmail: await getServiceAccountEmail(),
  };
}

export async function saveGoogleCalendarConfig(
  userId: string,
  data: { calendarId: string; enabled: boolean },
): Promise<{ success: boolean; error?: string }> {
  try {
    const calendarId = normalizeCalendarId(data.calendarId);
    await db.user.update({
      where: { id: userId },
      data: {
        googleCalendarId: calendarId || null,
        // Solo se puede activar la sincronización si hay un calendario configurado.
        googleCalendarSyncEnabled: data.enabled && !!calendarId,
      } as any,
    });
    return { success: true };
  } catch {
    return { success: false, error: 'No se pudo guardar la configuración' };
  }
}

/* ── Event helpers ─────────────────────────────────────────── */
function buildEventBody(appt: {
  clientName: string | null;
  sessionName: string | null;
  remoteJid: string | null;
  serviceName: string | null;
  startTime: Date;
  endTime: Date;
  timezone: string;
}) {
  const clientName = appt.clientName || appt.sessionName || 'Cliente';
  const phone = (appt.remoteJid ?? '').replace(/@s\.whatsapp\.net$/, '');
  const summary = appt.serviceName ? `${appt.serviceName} — ${clientName}` : `Cita — ${clientName}`;
  const descriptionLines = [
    `Cliente: ${clientName}`,
    phone ? `WhatsApp: ${phone}` : '',
    appt.serviceName ? `Servicio: ${appt.serviceName}` : '',
    '',
    'Evento creado automáticamente desde la agenda.',
  ].filter(Boolean);

  return {
    summary,
    description: descriptionLines.join('\n'),
    start: { dateTime: appt.startTime.toISOString(), timeZone: appt.timezone },
    end: { dateTime: appt.endTime.toISOString(), timeZone: appt.timezone },
  };
}

async function loadApptForCalendar(appointmentId: string) {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      service: { select: { name: true } },
      session: { select: { pushName: true, remoteJid: true } },
      user: { select: { googleCalendarId: true, googleCalendarSyncEnabled: true } as any },
    },
  });
  if (!appt) return null;
  return appt;
}

/**
 * Crea (o recrea) el evento de Google Calendar para una cita y guarda su eventId.
 * Fire-and-forget: nunca lanza; devuelve el resultado por si se quiere loguear.
 */
export async function syncAppointmentToCalendar(
  appointmentId: string,
): Promise<{ success: boolean; error?: string; eventId?: string }> {
  try {
    const appt = await loadApptForCalendar(appointmentId);
    if (!appt) return { success: false, error: 'Cita no encontrada' };

    const calendarId = (appt.user as any)?.googleCalendarId as string | null;
    const enabled = (appt.user as any)?.googleCalendarSyncEnabled as boolean | undefined;
    if (!enabled || !calendarId) return { success: false, error: 'Sincronización no activada' };

    const calendar = google.calendar({ version: 'v3', auth: getAuth() });
    const body = buildEventBody({
      clientName: appt.clientName,
      sessionName: appt.session?.pushName ?? null,
      remoteJid: appt.session?.remoteJid ?? null,
      serviceName: appt.service?.name ?? null,
      startTime: appt.startTime,
      endTime: appt.endTime,
      timezone: appt.timezone,
    });

    const res = await calendar.events.insert({
      calendarId,
      requestBody: body,
    });

    const eventId = res.data.id ?? undefined;
    if (eventId) {
      await db.appointment.update({
        where: { id: appointmentId },
        data: { googleEventId: eventId } as any,
      });
    }
    return { success: true, eventId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[google-calendar] sync error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Actualiza el evento existente de una cita (reprogramación). Si aún no existe
 * evento pero la sincronización está activa, lo crea.
 */
export async function updateAppointmentCalendarEvent(
  appointmentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const appt = await loadApptForCalendar(appointmentId);
    if (!appt) return { success: false, error: 'Cita no encontrada' };

    const calendarId = (appt.user as any)?.googleCalendarId as string | null;
    const enabled = (appt.user as any)?.googleCalendarSyncEnabled as boolean | undefined;
    if (!enabled || !calendarId) return { success: false, error: 'Sincronización no activada' };

    const eventId = (appt as any).googleEventId as string | null;
    if (!eventId) {
      // No había evento aún → crearlo.
      const created = await syncAppointmentToCalendar(appointmentId);
      return { success: created.success, error: created.error };
    }

    const calendar = google.calendar({ version: 'v3', auth: getAuth() });
    const body = buildEventBody({
      clientName: appt.clientName,
      sessionName: appt.session?.pushName ?? null,
      remoteJid: appt.session?.remoteJid ?? null,
      serviceName: appt.service?.name ?? null,
      startTime: appt.startTime,
      endTime: appt.endTime,
      timezone: appt.timezone,
    });

    try {
      await calendar.events.patch({ calendarId, eventId, requestBody: body });
    } catch (err: any) {
      // Si el evento fue borrado en Google (404/410), recrearlo.
      const status = err?.code ?? err?.response?.status;
      if (status === 404 || status === 410) {
        await db.appointment.update({ where: { id: appointmentId }, data: { googleEventId: null } as any });
        const created = await syncAppointmentToCalendar(appointmentId);
        return { success: created.success, error: created.error };
      }
      throw err;
    }
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[google-calendar] update error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Borra el evento de Google Calendar asociado. Se le pasan userId + eventId
 * directamente porque suele llamarse justo antes/después de eliminar la cita.
 */
export async function deleteCalendarEvent(
  userId: string,
  eventId: string | null | undefined,
): Promise<{ success: boolean; error?: string }> {
  if (!eventId) return { success: true };
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { googleCalendarId: true, googleCalendarSyncEnabled: true } as any,
    });
    const calendarId = (user as any)?.googleCalendarId as string | null;
    if (!calendarId) return { success: false, error: 'Sin calendario configurado' };

    const calendar = google.calendar({ version: 'v3', auth: getAuth() });
    try {
      await calendar.events.delete({ calendarId, eventId });
    } catch (err: any) {
      const status = err?.code ?? err?.response?.status;
      // 404/410 = ya no existe: se considera éxito idempotente.
      if (status !== 404 && status !== 410) throw err;
    }
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[google-calendar] delete error:', msg);
    return { success: false, error: msg };
  }
}
