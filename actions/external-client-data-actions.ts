'use server';

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { buildWhatsAppJidCandidates, normalizeWhatsAppConversationJid } from '@/lib/whatsapp-jid';
import type {
  ExternalClientData,
  ExternalClientDataImportResult,
  ExternalClientDataImportRow,
  ExternalClientDataListResult,
  ExternalClientDataRecord,
  GoogleSheetImportOptions,
} from '@/types/external-client-data';

// ─── Search by field ──────────────────────────────────────────────────────────

/**
 * Busca registros de datos externos filtrando por un campo arbitrario del JSON.
 * Soporta búsqueda exacta (default) o parcial (contains).
 *
 * @param userId     Dueño de los datos
 * @param field      Nombre del campo en el JSON (ej: "CEDULA", "CORREO"). Case-sensitive.
 * @param value      Valor a buscar
 * @param exact      true = coincidencia exacta, false = contiene el texto (default: true)
 */
export async function searchExternalClientDataByField(
  userId: string,
  field: string,
  value: string,
  exact = true,
): Promise<ExternalClientData[]> {
  if (!userId || !field || !value) return [];

  const jsonFilter = exact
    ? { path: [field], equals: value }
    : { path: [field], string_contains: value };

  const records = await db.externalClientData.findMany({
    where: {
      userId,
      data: jsonFilter,
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  return records as ExternalClientData[];
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Busca los datos externos de un cliente por remoteJid.
 * Genera variantes del JID para maximizar la probabilidad de match.
 */
export async function getExternalClientDataByRemoteJid(
  userId: string,
  remoteJid: string,
): Promise<ExternalClientData | null> {
  if (!userId || !remoteJid) return null;

  const candidates = buildWhatsAppJidCandidates(remoteJid);

  const record = await db.externalClientData.findFirst({
    where: {
      userId,
      remoteJid: { in: candidates },
    },
  });

  return record as ExternalClientData | null;
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Crea o actualiza el registro de datos externos para un remoteJid.
 * El remoteJid se normaliza a formato canónico antes de persistir.
 */
export async function upsertExternalClientData(
  userId: string,
  remoteJid: string,
  data: ExternalClientDataRecord,
  source = 'manual',
): Promise<ExternalClientData> {
  const canonicalJid = normalizeWhatsAppConversationJid(remoteJid) || remoteJid;

  const record = await db.externalClientData.upsert({
    where: { userId_remoteJid: { userId, remoteJid: canonicalJid } },
    create: { userId, remoteJid: canonicalJid, data: data as Prisma.InputJsonValue, source },
    update: { data: data as Prisma.InputJsonValue, source, updatedAt: new Date() },
  });

  return record as ExternalClientData;
}

// ─── Bulk import ──────────────────────────────────────────────────────────────

/**
 * Importación masiva de registros externos (CSV, hoja de cálculo, etc.).
 * Cada fila debe incluir remoteJid y un objeto data con campos arbitrarios.
 * Los remoteJid se normalizan automáticamente.
 */
export async function importExternalClientDataBulk(
  userId: string,
  rows: ExternalClientDataImportRow[],
  source = 'import',
): Promise<ExternalClientDataImportResult> {
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const canonicalJid =
        normalizeWhatsAppConversationJid(row.remoteJid) || row.remoteJid;
      if (!canonicalJid) {
        errors++;
        continue;
      }

      const existing = await db.externalClientData.findUnique({
        where: { userId_remoteJid: { userId, remoteJid: canonicalJid } },
        select: { id: true },
      });

      if (existing) {
        await db.externalClientData.update({
          where: { userId_remoteJid: { userId, remoteJid: canonicalJid } },
          data: { data: row.data as Prisma.InputJsonValue, source, updatedAt: new Date() },
        });
        updated++;
      } else {
        await db.externalClientData.create({
          data: { userId, remoteJid: canonicalJid, data: row.data as Prisma.InputJsonValue, source },
        });
        created++;
      }
    } catch {
      errors++;
    }
  }

  return { created, updated, errors };
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listExternalClientData(
  userId: string,
  page = 1,
  pageSize = 50,
): Promise<ExternalClientDataListResult> {
  const skip = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    db.externalClientData.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.externalClientData.count({ where: { userId } }),
  ]);

  return { items: items as ExternalClientData[], total };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteExternalClientData(
  userId: string,
  remoteJid: string,
): Promise<boolean> {
  try {
    const canonicalJid = normalizeWhatsAppConversationJid(remoteJid) || remoteJid;
    await db.externalClientData.delete({
      where: { userId_remoteJid: { userId, remoteJid: canonicalJid } },
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteAllExternalClientData(userId: string): Promise<number> {
  const result = await db.externalClientData.deleteMany({ where: { userId } });
  return result.count;
}

// ─── Google Sheets import ─────────────────────────────────────────────────────

/**
 * Convierte una URL de edición de Google Sheets a URL de exportación CSV.
 * Soporta ambas formas:
 *   .../edit?gid=123456
 *   .../edit#gid=123456
 */
function buildGoogleSheetsCsvUrl(sheetUrl: string): string | null {
  try {
    const url = new URL(sheetUrl);
    const pathMatch = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!pathMatch) return null;

    const spreadsheetId = pathMatch[1];
    const gid =
      url.searchParams.get('gid') ??
      url.hash.replace('#gid=', '').trim() ??
      '0';

    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  } catch {
    return null;
  }
}

/**
 * Parser CSV robusto que maneja valores entre comillas con comas internas.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(csvText: string): Record<string, string>[] {
  const lines = csvText
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim());

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim());

  return lines
    .slice(1)
    .map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(
        headers.map((h, i) => [h, (values[i] ?? '').replace(/^"|"$/g, '').trim()]),
      );
    })
    .filter((row) => Object.values(row).some((v) => v !== ''));
}

/**
 * Descarga una hoja de Google Sheets, la parsea como CSV e importa los datos.
 *
 * Requisito: la hoja debe ser accesible públicamente (o compartida con "cualquiera con el enlace").
 *
 * @param userId          ID del usuario dueño de los datos
 * @param sheetUrl        URL de Google Sheets (formato /edit o /edit?gid=...)
 * @param options.remoteJidColumn  Nombre de la columna con el número de WhatsApp (default: "WHATSAPP")
 * @param options.source  Etiqueta de origen para auditoría (default: "google_sheets")
 *
 * @example
 * const result = await importFromGoogleSheetUrl(userId,
 *   'https://docs.google.com/spreadsheets/d/ABC.../edit?gid=123',
 *   { remoteJidColumn: 'WHATSAPP' }
 * );
 * // { created: 45, updated: 3, errors: 0 }
 */
export async function importFromGoogleSheetUrl(
  userId: string,
  sheetUrl: string,
  options: GoogleSheetImportOptions = {},
): Promise<ExternalClientDataImportResult> {
  const { remoteJidColumn = 'WHATSAPP', source = 'google_sheets' } = options;

  const csvUrl = buildGoogleSheetsCsvUrl(sheetUrl);
  if (!csvUrl) {
    return { created: 0, updated: 0, errors: 0, parseErrors: ['URL de Google Sheets inválida'] };
  }

  let csvText: string;
  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      return {
        created: 0,
        updated: 0,
        errors: 0,
        parseErrors: [`Error al descargar la hoja: HTTP ${response.status}`],
      };
    }
    csvText = await response.text();
  } catch (err: any) {
    return {
      created: 0,
      updated: 0,
      errors: 0,
      parseErrors: [`Error de red: ${err?.message ?? 'desconocido'}`],
    };
  }

  const rows = parseCsv(csvText);
  if (!rows.length) {
    return { created: 0, updated: 0, errors: 0, parseErrors: ['La hoja no contiene datos'] };
  }

  // Busca la columna de remoteJid de forma case-insensitive
  const firstRow = rows[0];
  const jidColumnKey = Object.keys(firstRow).find(
    (k) => k.toUpperCase() === remoteJidColumn.toUpperCase(),
  );

  if (!jidColumnKey) {
    const available = Object.keys(firstRow).join(', ');
    return {
      created: 0,
      updated: 0,
      errors: 0,
      parseErrors: [
        `Columna "${remoteJidColumn}" no encontrada. Columnas disponibles: ${available}`,
      ],
    };
  }

  // Construye las filas de importación: remoteJid + resto de columnas como data
  const importRows: ExternalClientDataImportRow[] = rows
    .map((row) => {
      const remoteJid = row[jidColumnKey]?.trim();
      if (!remoteJid) return null;

      const data: ExternalClientDataRecord = {};
      for (const [key, value] of Object.entries(row)) {
        if (key !== jidColumnKey && value !== '') {
          data[key] = value;
        }
      }

      return { remoteJid, data };
    })
    .filter((r): r is ExternalClientDataImportRow => r !== null);

  return importExternalClientDataBulk(userId, importRows, source);
}
