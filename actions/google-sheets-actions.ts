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

export async function getUserSheetsUrl(userId: string): Promise<string | null> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { sheetsUrl: true } as any });
    return (user as any)?.sheetsUrl ?? null;
  } catch {
    return null;
  }
}

/* ── Sync ──────────────────────────────────────────────────── */
const HEADERS = [
  'Teléfono', 'Nombre', 'Empresa', 'Cargo', 'Documento',
  'Email', 'Teléfono alt.', 'Fecha', 'País', 'Ciudad', 'Dirección',
  'Sitio web', 'Instagram', 'Facebook', 'LinkedIn', 'Notas', 'Actualizado',
];
const COL_END = 'Q'; // 17 columnas

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
    documento?: string;
    telefono?: string;
    fecha?: string;
    pais?: string;
    direccion?: string;
    sitioWeb?: string;
    instagram?: string;
    facebook?: string;
    linkedin?: string;
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
      range: `A1:${COL_END}1`,
    });
    if (!meta.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `A1:${COL_END}1`,
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
      payload.empresa ?? '',
      payload.cargo ?? '',
      payload.documento ?? '',
      payload.email ?? '',
      payload.telefono ?? '',
      payload.fecha ?? '',
      payload.pais ?? '',
      payload.ciudad ?? '',
      payload.direccion ?? '',
      payload.sitioWeb ?? '',
      payload.instagram ?? '',
      payload.facebook ?? '',
      payload.linkedin ?? '',
      payload.notas ?? '',
      new Date().toLocaleString('es-CO'),
    ];

    if (rowIdx > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `A${rowIdx + 1}:${COL_END}${rowIdx + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `A:${COL_END}`,
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
