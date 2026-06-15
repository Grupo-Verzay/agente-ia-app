'use server';

import { google } from 'googleapis';

const SPREADSHEET_ID = '11s450vRmAayrxqodQXpwIDwEI7r7jWlaeairvQ6qFUg';
const SHEET_NAME = 'Registro reunión';

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export type RegistroReunionPayload = {
  pais: string;
  contacto: string;
  nombreNegocio: string;
  mensajesAlDia: string;
  asesores: string;
  procesoVentas: string;
  urgencia: string;
  tareasObjetivos: string;
};

export async function submitRegistroReunion(
  data: RegistroReunionPayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

    // Columnas A=ID Registro, B=Chat ID, C=Formulario, D=Fecha, E=País, F=WhatsApp,
    // G=Nombre negocio, H=Mensajes aprox, I=Asesores, J=Proceso ventas, K=Urgencia, L=Tareas
    const row = [
      '',    // A: ID Registro (vacío — rellenar con fórmula en Sheets)
      'WEB', // B: Chat ID
      'Registro web', // C: Formulario (fuente)
      fecha,        // D: Fecha Actualización
      data.pais,
      data.contacto,
      data.nombreNegocio,
      data.mensajesAlDia,
      data.asesores,
      data.procesoVentas,
      data.urgencia,
      data.tareasObjetivos,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A:L`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}
