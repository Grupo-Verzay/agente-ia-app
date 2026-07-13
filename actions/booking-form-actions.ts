'use server';

import { db } from '@/lib/db';
import { google } from 'googleapis';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export type FormAnswer = { questionId: string; label: string; answer: string };

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON (o GOOGLE_SHEETS_CREDENTIALS)');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function extractSheetId(input: string): string | null {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{30,}$/.test(input.trim())) return input.trim();
  return null;
}

export async function saveBookingFormResponse(data: {
  userId: string;
  answers: FormAnswer[];
  appointmentId?: string;
  bookingAppointmentId?: string;
  clientName?: string;
  clientPhone?: string;
  startTime?: string;
  timezone?: string;
}): Promise<{ success: boolean; responseId?: string }> {
  try {
    const response = await db.bookingFormResponse.create({
      data: {
        userId: data.userId,
        answers: data.answers as any,
        appointmentId: data.appointmentId ?? null,
        bookingAppointmentId: data.bookingAppointmentId ?? null,
      },
    });

    // Sync a Sheets en background (no bloquea)
    syncResponseToSheets(response.id, data).catch(() => {});

    return { success: true, responseId: response.id };
  } catch {
    return { success: false };
  }
}

async function syncResponseToSheets(
  responseId: string,
  data: {
    userId: string;
    answers: FormAnswer[];
    clientName?: string;
    clientPhone?: string;
    startTime?: string;
    timezone?: string;
  },
): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: data.userId },
      select: { sheetsUrl: true, timezone: true },
    });

    if (!user?.sheetsUrl) return;

    const sheetId = extractSheetId(user.sheetsUrl);
    if (!sheetId) return;

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const SHEET_NAME = 'Registro cita';

    // Obtener o crear la hoja "Registro reunión"
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetExists = meta.data.sheets?.some((s) => s.properties?.title === SHEET_NAME);

    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
      });
    }

    // Encabezados fijos + dinámicos por respuesta
    const dynamicHeaders = data.answers.map((a) => a.label);
    const HEADERS = ['Formulario', 'Fecha', 'WhatsApp', 'Nombre', ...dynamicHeaders];

    const headerRow = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${SHEET_NAME}'!A1:Z1`,
    });

    if (!headerRow.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'${SHEET_NAME}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    }

    // Formatear fecha/hora
    let fechaLabel = '';
    if (data.startTime) {
      const tz = data.timezone ?? user.timezone ?? 'UTC';
      const local = toZonedTime(new Date(data.startTime), tz);
      fechaLabel = format(local, 'yyyy-MM-dd HH:mm');
    }

    const row = [
      SHEET_NAME,
      fechaLabel || new Date().toLocaleString('es-CO'),
      data.clientPhone ?? '',
      data.clientName ?? '',
      ...data.answers.map((a) => a.answer),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${SHEET_NAME}'!A:Z`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    await db.bookingFormResponse.update({
      where: { id: responseId },
      data: { syncedToSheets: true, sheetsSyncedAt: new Date() },
    });
  } catch {
    // Silencioso — el fallo de Sheets no afecta la cita
  }
}

export async function getBookingFormResponse(appointmentId: string): Promise<FormAnswer[] | null> {
  try {
    const r = await db.bookingFormResponse.findUnique({
      where: { appointmentId },
      select: { answers: true },
    });
    return r ? (r.answers as FormAnswer[]) : null;
  } catch {
    return null;
  }
}

export async function getBookingFormResponseByBooking(bookingAppointmentId: string): Promise<FormAnswer[] | null> {
  try {
    const r = await db.bookingFormResponse.findUnique({
      where: { bookingAppointmentId },
      select: { answers: true },
    });
    return r ? (r.answers as FormAnswer[]) : null;
  } catch {
    return null;
  }
}

export type BookingResponseRow = {
  id: string;
  createdAt: string;
  clientName: string;
  clientPhone: string;
  appointmentStart: string | null;
  appointmentTimezone: string | null;
  serviceName: string | null;
  status: string | null;
  syncedToSheets: boolean;
  sheetsSyncedAt: string | null;
  answers: FormAnswer[];
};

/**
 * Lista todas las respuestas del formulario de agendamiento de un asesor para
 * mostrarlas en la App (pestaña "Registros"). El nombre/WhatsApp/fecha/servicio
 * no viven en booking_form_responses (solo el vínculo a la cita), así que se
 * resuelven uniendo con la cita asociada (Appointment o BookingAppointment).
 */
export async function getBookingFormResponses(userId: string): Promise<BookingResponseRow[]> {
  if (!userId) return [];
  try {
    const rows = await db.bookingFormResponse.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        appointment: {
          include: {
            service: { select: { name: true } },
            session: { select: { remoteJid: true, pushName: true, customName: true } },
          },
        },
        bookingAppointment: {
          include: { teamService: { select: { name: true } } },
        },
      },
    });

    return rows.map((r) => {
      const appt = r.appointment;
      const bk = r.bookingAppointment;
      const phoneFromSession = appt?.session?.remoteJid
        ? appt.session.remoteJid.split('@')[0]
        : '';
      const clientName =
        appt?.clientName ||
        bk?.clientName ||
        appt?.session?.customName ||
        appt?.session?.pushName ||
        '';
      const start = appt?.startTime ?? bk?.startTime ?? null;

      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        clientName,
        clientPhone: bk?.clientPhone || phoneFromSession || '',
        appointmentStart: start ? start.toISOString() : null,
        appointmentTimezone: appt?.timezone ?? bk?.timezone ?? null,
        serviceName: appt?.service?.name ?? bk?.teamService?.name ?? null,
        status: appt?.status ?? bk?.status ?? null,
        syncedToSheets: r.syncedToSheets,
        sheetsSyncedAt: r.sheetsSyncedAt ? r.sheetsSyncedAt.toISOString() : null,
        answers: Array.isArray(r.answers) ? (r.answers as unknown as FormAnswer[]) : [],
      };
    });
  } catch {
    return [];
  }
}

export async function deleteBookingFormResponse(id: string): Promise<{ success: boolean }> {
  if (!id) return { success: false };
  try {
    await db.bookingFormResponse.delete({ where: { id } });
    return { success: true };
  } catch {
    return { success: false };
  }
}
