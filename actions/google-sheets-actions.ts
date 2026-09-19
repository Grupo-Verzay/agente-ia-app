'use server';

import { google } from 'googleapis';
import { db } from '@/lib/db';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { normalizeContactFieldsConfig } from '@/lib/contact-fields';
import {
  pickExplicitWhatsAppPhoneJid,
  fmtPhone,
  isGroupJid,
  isBroadcastJid,
  isStatusBroadcastJid,
} from '@/lib/whatsapp-jid';

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

/**
 * Estas tres —`laHojaDe`, `elAutoSyncDe` y `volcarElContacto`— son el camino
 * del SISTEMA y por eso NO se exportan.
 *
 * La cuenta les llega **ya resuelta** por quien las llama: una accion que
 * acaba de comprobar quien es, o `autoSyncContactIfEnabled`, que la recibe de
 * `/api/owner/sync-contact` —una ruta con su propia llave y sin sesion—.
 * Ponerles la guarda de siempre las romperia por ese segundo camino:
 * `currentUser()` devuelve vacio desde una ruta maquina-a-maquina, asi que la
 * sincronizacion automatica dejaria de volcar nada **sin un solo error** — que
 * es exactamente lo que dejo los avisos de Waha callados durante dias.
 *
 * Y no se exportan porque **una accion es un endpoint**: exportadas desde un
 * fichero `'use server'`, cualquiera con una sesion les pasaria el id de otra
 * cuenta y le leeria su hoja, o le escribiria filas dentro.
 */
async function laHojaDe(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { googleSheetsWebhookUrl: true },
  });
  return (user as any)?.googleSheetsWebhookUrl ?? null;
}

export async function getGoogleSheetsConfig(userId: string): Promise<string | null> {
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) return null;
  return laHojaDe(cuenta);
}

export async function saveGoogleSheetId(userId: string, sheetInput: string): Promise<{ success: boolean; error?: string }> {
  // Sin guarda, esto era la exfiltracion entera: con el id de otra cuenta se le
  // apuntaba la sincronizacion a la hoja de uno, y **cada lead nuevo suyo** se
  // escribia alli sin que nadie se enterara.
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) return { success: false, error: 'No autorizado' };

  const sheetId = extractSheetId(sheetInput) ?? sheetInput.trim();
  try {
    await db.user.update({
      where: { id: cuenta },
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
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) return { success: false, error: 'No autorizado' };
  try {
    await db.user.update({
      where: { id: cuenta },
      data: { sheetsUrl: url.trim() || null } as any,
    });
    return { success: true };
  } catch {
    return { success: false, error: 'No se pudo guardar la URL' };
  }
}

export async function getBookingFormName(userId: string): Promise<string | null> {
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) return null;
  try {
    const user = await db.user.findUnique({ where: { id: cuenta }, select: { sheetsFormName: true } as any });
    return (user as any)?.sheetsFormName ?? null;
  } catch {
    return null;
  }
}

export async function saveBookingFormName(userId: string, name: string): Promise<{ success: boolean }> {
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) return { success: false };
  try {
    await db.user.update({
      where: { id: cuenta },
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
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) return { success: false, error: 'No autorizado' };
  try {
    await db.user.update({
      where: { id: cuenta },
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
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) return null;
  try {
    const user = await db.user.findUnique({ where: { id: cuenta }, select: { sheetsUrl: true } as any });
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
  payload: { phone: string; name: string; advisor?: string } & Record<string, string | undefined>,
): Promise<{ success: boolean; error?: string }> {
  // Lo que se abria sin esto: escribirle filas a la hoja de otra cuenta, con el
  // contenido que uno quisiera. El `payload` no se toca —es lo que la pantalla
  // acaba de teclear—; lo que se comprueba es **de quien es la hoja**.
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) return { success: false, error: 'No autorizado' };
  return volcarElContacto(cuenta, payload);
}

async function volcarElContacto(
  userId: string,
  payload: { phone: string; name: string; advisor?: string } & Record<string, string | undefined>,
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

  // 'Asesor' es una columna fija por defecto (Teléfono · Nombre · Asesor · …).
  const headers = ['Teléfono', 'Nombre', 'Asesor', ...fieldDefs.map((f) => f.label), 'Actualizado'];
  const colEnd = columnLetter(headers.length);
  const row = [
    payload.phone,
    payload.name,
    payload.advisor ?? '',
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

/* ── Sincronización masiva ─────────────────────────────────── */
// Resuelve el nombre visible de un asesor (empresa || nombre || email).
async function resolveAdvisorNames(advisorIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = Array.from(new Set(advisorIds.filter(Boolean)));
  if (!ids.length) return map;
  const advisors = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  for (const a of advisors) {
    // Igual que la UI de chats: el asesor se muestra por su NOMBRE (fallback email).
    map.set(a.id, (a.name || a.email || '').trim());
  }
  return map;
}

/**
 * Sincroniza TODOS los contactos de la cuenta a la Google Sheet en una sola
 * pasada (upsert por teléfono). Columnas por defecto: Teléfono · Nombre · Asesor,
 * más los campos personalizados habilitados del usuario.
 *
 * Escritura por lotes (2 llamadas a la API: 1 lectura + 1 escritura) para no
 * chocar con los límites de Google al haber cientos de contactos. Preserva las
 * filas existentes que no correspondan a contactos actuales (no borra nada).
 */
export async function syncAllContactsToGoogleSheets(
  userId: string,
): Promise<{ success: boolean; message?: string; count?: number }> {
  // Llevaba su propia condición, `me.effectiveId !== userId`, y era la puerta
  // de esta pantalla escrita a mano: dejaba fuera al administrador que llega a
  // una cuenta por `linked_accounts`, que es el #783 otra vez. Va por la misma
  // función que sus diez hermanas.
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) return { success: false, message: 'No autorizado.' };
  userId = cuenta;

  const userRec = await db.user.findUnique({
    where: { id: userId },
    select: { googleSheetsWebhookUrl: true, contactFieldsConfig: true },
  });
  const config = (userRec as { googleSheetsWebhookUrl?: string | null })?.googleSheetsWebhookUrl ?? null;
  if (!config) {
    return {
      success: false,
      message: 'Primero conecta tu Google Sheet (en la ficha de contacto, sección Google Sheets).',
    };
  }
  const sheetId = extractSheetId(config) ?? config;

  const fieldDefs = normalizeContactFieldsConfig(
    (userRec as { contactFieldsConfig?: unknown })?.contactFieldsConfig,
  )
    .filter((f) => f.enabled)
    .sort((a, b) => a.order - b.order);

  const headers = ['Teléfono', 'Nombre', 'Asesor', ...fieldDefs.map((f) => f.label), 'Actualizado'];
  const colEnd = columnLetter(headers.length);

  // Contactos (sesiones) + valores de campos personalizados, en dos consultas.
  const [sessions, externalData] = await Promise.all([
    db.session.findMany({
      where: { userId },
      select: {
        remoteJid: true,
        remoteJidAlt: true,
        pushName: true,
        customName: true,
        assignedAdvisorId: true,
      },
    }),
    fieldDefs.length
      ? db.externalClientData.findMany({ where: { userId }, select: { remoteJid: true, data: true } })
      : Promise.resolve([] as { remoteJid: string; data: unknown }[]),
  ]);

  const advisorMap = await resolveAdvisorNames(
    sessions.map((s) => s.assignedAdvisorId).filter((id): id is string => Boolean(id)),
  );

  // Índice de campos personalizados por remoteJid.
  const dataByJid = new Map<string, Record<string, unknown>>();
  for (const d of externalData) {
    if (d?.remoteJid && d.data && typeof d.data === 'object') {
      dataByJid.set(d.remoteJid, d.data as Record<string, unknown>);
    }
  }

  const now = new Date().toLocaleString('es-CO');
  // Fila por teléfono (dedup: el último contacto con ese teléfono gana).
  const rowByPhone = new Map<string, string[]>();
  for (const s of sessions) {
    const base =
      pickExplicitWhatsAppPhoneJid([s.remoteJid, s.remoteJidAlt]) || s.remoteJidAlt || s.remoteJid;
    if (isGroupJid(base) || isBroadcastJid(base) || isStatusBroadcastJid(base)) continue;
    const phone = fmtPhone(base);
    if (!phone) continue;
    const name = s.customName || s.pushName || '';
    const advisor = s.assignedAdvisorId ? advisorMap.get(s.assignedAdvisorId) ?? '' : '';
    const data = dataByJid.get(s.remoteJid) ?? (s.remoteJidAlt ? dataByJid.get(s.remoteJidAlt) : undefined) ?? {};
    const custom = fieldDefs.map((f) => {
      const v = (data as Record<string, unknown>)[f.key];
      return v == null ? '' : String(v);
    });
    rowByPhone.set(phone, [phone, name, advisor, ...custom, now]);
  }

  if (rowByPhone.size === 0) {
    return { success: false, message: 'No hay contactos para sincronizar.' };
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // 1) Leer la hoja completa una sola vez.
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `A:${colEnd}`,
    });
    const existingRows = existing.data.values ?? [];

    // 2) Reconstruir la matriz: encabezados + filas existentes actualizadas en
    //    su sitio + contactos nuevos al final. Preserva filas ajenas al CRM.
    const pad = (r: string[]) => (r.length >= headers.length ? r.slice(0, headers.length) : [...r, ...Array(headers.length - r.length).fill('')]);
    const written = new Set<string>();
    const result: string[][] = [headers];

    for (let i = 1; i < existingRows.length; i++) {
      const phone = String(existingRows[i]?.[0] ?? '');
      const updated = rowByPhone.get(phone);
      if (updated) {
        result.push(pad(updated));
        written.add(phone);
      } else {
        result.push(pad(existingRows[i] as string[]));
      }
    }
    rowByPhone.forEach((row, phone) => {
      if (!written.has(phone)) result.push(pad(row));
    });

    // 3) Escribir todo de un golpe.
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `A1:${colEnd}${result.length}`,
      valueInputOption: 'RAW',
      requestBody: { values: result },
    });

    return { success: true, message: `Se sincronizaron ${rowByPhone.size} contactos a Google Sheets.`, count: rowByPhone.size };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: `Error al sincronizar: ${msg}` };
  }
}

/* ── Sincronización automática (opt-in) ───────────────────────
 * El opt-in se guarda por cuenta en User.sheetsAutoSyncEnabled. Cuando está
 * activo, autoSyncContactIfEnabled vuelca cada lead nuevo o modificado; el botón
 * masivo sigue disponible igual.
 */
async function elAutoSyncDe(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { sheetsAutoSyncEnabled: true },
    });
    return user?.sheetsAutoSyncEnabled ?? false;
  } catch {
    return false;
  }
}

export async function getSheetsAutoSyncEnabled(userId: string): Promise<boolean> {
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) return false;
  return elAutoSyncDe(cuenta);
}

export async function setSheetsAutoSyncEnabled(
  userId: string,
  enabled: boolean,
): Promise<{ success: boolean; message?: string }> {
  if (!userId) return { success: false, message: 'Cuenta no válida.' };
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) return { success: false, message: 'No autorizado.' };

  // Activar sin una hoja conectada dejaría el interruptor encendido sin efecto.
  if (enabled) {
    const cfg = await laHojaDe(cuenta);
    if (!cfg) {
      return {
        success: false,
        message: 'Primero conecta una hoja de Google Sheets.',
      };
    }
  }

  try {
    await db.user.update({
      where: { id: cuenta },
      data: { sheetsAutoSyncEnabled: enabled },
    });
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: `No se pudo guardar: ${msg}` };
  }
}

/**
 * Sincroniza UN contacto a Google Sheets SOLO si la cuenta tiene activada la
 * sincronización automática (opt-in). Pensada para llamarse (sin await crítico)
 * desde las acciones que crean/modifican un lead: renombrar, asignar asesor,
 * guardar datos, crear contacto. Nunca lanza: si algo falla, no rompe el flujo
 * principal — el dueño siempre puede reintentar con el botón masivo.
 *
 * ## Y esta se queda ABIERTA a propósito
 *
 * Es la única del fichero sin guarda, y tiene que serlo: uno de sus llamadores
 * es `/api/owner/sync-contact`, la ruta que el BACKEND llama cuando entra un
 * lead nuevo por WhatsApp. Ahí **no hay sesión** —`currentUser()` devuelve
 * vacío—, así que la guarda de siempre no la protegería: la apagaría, y una
 * sincronización que deja de volcar sin decir nada es exactamente el fallo de
 * los avisos de Waha.
 *
 * Lo que la hace aceptable es **lo que no puede hacer**. No recibe ningún dato:
 * solo una cuenta y un `remoteJid`. Lo que escribe lo lee ella misma de la
 * conversación de ESA cuenta, y lo escribe en la hoja de ESA cuenta, y solo si
 * esa cuenta activó el opt-in y conectó una hoja. O sea que lo peor que
 * consigue quien la llame a mano es adelantar un volcado que el dueño ya pidió
 * — nada sale de su cuenta, y nada entra que no fuera suyo.
 *
 * Los dos datos que sí llegarían de fuera —qué se escribe y en qué hoja— se
 * cerraron aparte: el primero solo lo acepta `syncContactToGoogleSheets`, que
 * sí lleva guarda, y el segundo lo decide `laHojaDe`, que no se exporta.
 */
export async function autoSyncContactIfEnabled(userId: string, remoteJid: string): Promise<void> {
  try {
    if (!userId || !remoteJid) return;
    const enabled = await elAutoSyncDe(userId);
    if (!enabled) return;

    // Necesita una hoja conectada; si no hay, no hace nada.
    const cfg = await laHojaDe(userId);
    if (!cfg) return;

    const session = await db.session.findFirst({
      where: { userId, OR: [{ remoteJid }, { remoteJidAlt: remoteJid }] },
      select: {
        remoteJid: true,
        remoteJidAlt: true,
        pushName: true,
        customName: true,
        assignedAdvisorId: true,
      },
    });
    if (!session) return;

    const base =
      pickExplicitWhatsAppPhoneJid([session.remoteJid, session.remoteJidAlt]) ||
      session.remoteJidAlt ||
      session.remoteJid;
    if (isGroupJid(base) || isBroadcastJid(base) || isStatusBroadcastJid(base)) return;
    const phone = fmtPhone(base);
    if (!phone) return;

    const advisorMap = session.assignedAdvisorId
      ? await resolveAdvisorNames([session.assignedAdvisorId])
      : new Map<string, string>();
    const advisor = session.assignedAdvisorId ? advisorMap.get(session.assignedAdvisorId) ?? '' : '';

    // Campos personalizados del contacto (si el usuario los tiene).
    const ext = await db.externalClientData.findFirst({
      where: { userId, remoteJid: { in: [session.remoteJid, session.remoteJidAlt].filter(Boolean) as string[] } },
      select: { data: true },
    });
    const fields: Record<string, string> = {};
    if (ext?.data && typeof ext.data === 'object') {
      for (const [k, v] of Object.entries(ext.data as Record<string, unknown>)) {
        fields[k] = v == null ? '' : String(v);
      }
    }

    await volcarElContacto(userId, {
      phone,
      name: session.customName || session.pushName || '',
      advisor,
      ...fields,
    });
  } catch {
    // Silencioso a propósito: la auto-sync nunca debe romper la acción principal.
  }
}
