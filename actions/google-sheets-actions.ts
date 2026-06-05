'use server';

import { google } from 'googleapis';
import { db } from '@/lib/db';

/* ── Service account auth ──────────────────────────────────── */
function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta la variable GOOGLE_SERVICE_ACCOUNT_JSON en el .env');
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

/* ── Sync ──────────────────────────────────────────────────── */
const HEADERS = ['Teléfono', 'Nombre', 'Email', 'Empresa', 'Ciudad', 'Cargo', 'Notas', 'Actualizado'];

export async function syncContactToGoogleSheets(
  userId: string,
  payload: {
    phone: string;
    name: string;
    email?: string;
    empresa?: string;
    ciudad?: string;
    cargo?: string;
    notas?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  const config = await getGoogleSheetsConfig(userId);
  if (!config) return { success: false, error: 'No hay hoja configurada' };

  const sheetId = extractSheetId(config) ?? config;

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Asegurar que existan los encabezados en la fila 1
    const meta = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A1:H1',
    });
    if (!meta.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'A1:H1',
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    }

    // Buscar fila existente por teléfono
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A:A',
    });
    const phones = existing.data.values?.flat() ?? [];
    const rowIdx = phones.findIndex((p, i) => i > 0 && p === payload.phone);

    const row = [
      payload.phone,
      payload.name,
      payload.email ?? '',
      payload.empresa ?? '',
      payload.ciudad ?? '',
      payload.cargo ?? '',
      payload.notas ?? '',
      new Date().toLocaleString('es-CO'),
    ];

    if (rowIdx > 0) {
      // Actualizar fila existente
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `A${rowIdx + 1}:H${rowIdx + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    } else {
      // Agregar nueva fila
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'A:H',
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
