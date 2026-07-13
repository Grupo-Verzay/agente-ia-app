'use server';

import { google } from 'googleapis';
import { db } from '@/lib/db';
import { normalizeContactFieldsConfig } from '@/lib/contact-fields';

/* ── Service account auth ──────────────────────────────────── */
function getAuth() {
  // Acepta cualquiera de los dos nombres: GOOGLE_SERVICE_ACCOUNT_JSON (app) o
  // GOOGLE_SHEETS_CREDENTIALS (el que ya usa el webhook), para reutilizar la
  // misma credencial sin renombrar la variable entre stacks.
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!raw) throw new Error('Falta la variable GOOGLE_SERVICE_ACCOUNT_JSON (o GOOGLE_SHEETS_CREDENTIALS) en el entorno');
  const creds = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function extractSheetId(input: string): string | null {
  if (!input) return null;
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{30,}$/.test(input.trim())) return input.trim();
  return null;
}

/* ── DB helpers ────────────────────────────────────────────── */
export async function getGoogleSheetsConfig(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { googleSheetsWebhookUrl: true },
  });
  return (user as any)?.googleSheetsWebhookUrl ?? null;
}

export async function saveGoogleSheetId(userId: string, sheetInput: string): Promise<{ success: boolean; error?: string }> {
  const sheetId = extractSheetId(sheetInput) ?? sheetInput.trim();
  try {
    await db.user.update({
      where: { id: userId },
      data: { googleSheetsWebhookUrl: sheetId || null } as any,
    });
    return { success: true };
  } catch {
    return { success: false, error: 'No se pudo guardar' };
  }
}

// Keep old name for backwards compat
export const saveGoogleSheetsWebhookUrl = saveGoogleSheetId;
export const getGoogleSheetsWebhookUrl = getGoogleSheetsConfig;

export async function saveUserSheetsUrl(userId: string, url: string): Promise<{ success: boolean; error?: string }> {
  try {
    await db.user.update({
      where: { id: userId },
      data: { sheetsUrl: url.trim() || null } as any,
    });
    return { success: true };
  } catch {
    return { success: false, error: 'No se pudo guardar la URL' };
  }
}

export async function getBookingFormName(userId: string): Promise<string | null> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { sheetsFormName: true } as any });
    return (user as any)?.sheetsFormName ?? null;
  } catch {
    return null;
  }
}

export async function saveBookingFormName(userId: string, name: string): Promise<{ success: boolean }> {
  try {
    await db.user.update({
      where: { id: userId },
      data: { sheetsFormName: name.trim() || null } as any,
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function saveUserSheetsFormNames(
  userId: string,
  names: { sheetsFormName: string | null; sheetsRegistroName: string | null }
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.user.update({
      where: { id: userId },
      data: {
        sheetsFormName: names.sheetsFormName?.trim() || null,
        sheetsRegistroName: names.sheetsRegistroName?.trim() || null,
      } as any,
    });
    return { success: true };
  } catch {
    return { success: false, error: 'No se pudo guardar' };
  }
}

export async function getUserSheetsUrl(userId: string): Promise<string | null> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { sheetsUrl: true } as any });
    return (user as any)?.sheetsUrl ?? null;
  } catch {
    return null;
  }
}

/* ── Sync ──────────────────────────────────────────────────── */
// Convierte un índice de columna (1-based) a letra A1 (1→A, 27→AA…).
function columnLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || 'A';
}

export async function syncContactToGoogleSheets(
  userId: string,
  payload: { phone: string; name: string } & Record<string, string | undefined>,
): Promise<{ success: boolean; error?: string }> {
  // Lee la hoja y la config de campos del usuario en una sola consulta.
  const userRec = await db.user.findUnique({
    where: { id: userId },
    select: { googleSheetsWebhookUrl: true, contactFieldsConfig: true },
  });
  const config = (userRec as { googleSheetsWebhookUrl?: string | null })?.googleSheetsWebhookUrl ?? null;
  if (!config) return { success: false, error: 'No hay hoja configurada' };

  const sheetId = extractSheetId(config) ?? config;

  // Columnas dinámicas según los campos habilitados del usuario.
  const fieldDefs = normalizeContactFieldsConfig(
    (userRec as { contactFieldsConfig?: unknown })?.contactFieldsConfig,
  )
    .filter((f) => f.enabled)
    .sort((a, b) => a.order - b.order);

  const headers = ['Teléfono', 'Nombre', ...fieldDefs.map((f) => f.label), 'Actualizado'];
  const colEnd = columnLetter(headers.length);
  const row = [
    payload.phone,
    payload.name,
    ...fieldDefs.map((f) => payload[f.key] ?? ''),
    new Date().toLocaleString('es-CO'),
  ];

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Escribir/actualizar SIEMPRE los encabezados (reflejan la config actual).
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `A1:${colEnd}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });

    // Buscar fila existente por teléfono (columna A = clave de match).
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A:A',
    });
    const phones = existing.data.values?.flat() ?? [];
    const rowIdx = phones.findIndex((p, i) => i > 0 && p === payload.phone);

    if (rowIdx > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `A${rowIdx + 1}:${colEnd}${rowIdx + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `A:${colEnd}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });
    }

    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}
