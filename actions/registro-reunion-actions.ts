'use server';

import { google } from 'googleapis';

const MASTER_SPREADSHEET_ID = '11s450vRmAayrxqodQXpwIDwEI7r7jWlaeairvQ6qFUg';
const SHEET_NAME = 'Registro reunión';

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

export type RegistroReunionPayload = {
  pais: string;
  contacto: string;
  nombreNegocio: string;
  mensajesAlDia: string;
  asesores: string;
  procesoVentas: string;
  urgencia: string;
  salesObjective: string;
  resellerSlug?: string;
  resellerSheetsUrl?: string | null;
};

export async function submitRegistroReunion(
  data: RegistroReunionPayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

    // Columnas A=ID Registro, B=Chat ID, C=Formulario, D=Fecha, E=País, F=WhatsApp,
    // G=Nombre negocio, H=Mensajes aprox, I=Asesores, J=Proceso ventas, K=Urgencia, L=Tareas, M=Reseller
    const row = [
      '',
      'WEB',
      data.resellerSlug ? `Reseller: ${data.resellerSlug}` : 'Registro web',
      fecha,
      data.pais,
      data.contacto,
      data.nombreNegocio,
      data.mensajesAlDia,
      data.asesores,
      data.procesoVentas,
      data.urgencia,
      data.salesObjective,
      data.resellerSlug ?? '',
    ];

    const appendParams = {
      range: `'${SHEET_NAME}'!A:M`,
      valueInputOption: 'RAW' as const,
      insertDataOption: 'INSERT_ROWS' as const,
      requestBody: { values: [row] },
    };

    // Siempre escribir en la hoja maestra
    await sheets.spreadsheets.values.append({
      spreadsheetId: MASTER_SPREADSHEET_ID,
      ...appendParams,
    });

    // Si el reseller tiene su propia hoja, escribir también ahí
    if (data.resellerSheetsUrl) {
      const resellerSheetId = extractSpreadsheetId(data.resellerSheetsUrl);
      if (resellerSheetId && resellerSheetId !== MASTER_SPREADSHEET_ID) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: resellerSheetId,
          ...appendParams,
        }).catch(() => null); // No bloquear el flujo si falla la hoja del reseller
      }
    }

    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}
