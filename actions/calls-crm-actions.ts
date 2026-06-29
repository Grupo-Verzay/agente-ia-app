'use server';

// CRM de Llamadas: lee las llamadas registradas en chat_messages (messageType
// 'call') y devuelve KPIs + serie por día + lista, para el dashboard de llamadas.
// Las salientes las registra el front en vivo; las entrantes el backend (evento
// CALL de Evolution). Aquí solo se LEE y agrega.

import { Prisma } from '@prisma/client';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { isCallDisposition } from '@/lib/call-dispositions';

export type CallDirection = 'incoming' | 'outgoing';

export interface CallRow {
  id: string;
  direction: CallDirection;
  phone: string;
  contactName: string | null;
  durationSecs: number;
  status: string;
  disposition: string | null;
  ts: number; // epoch ms
}

export interface CallsKpis {
  total: number;
  outgoing: number;
  incoming: number;
  missed: number;
  answered: number;
  totalDurationSecs: number;
  avgDurationSecs: number;
}

export interface CallsCrmData {
  kpis: CallsKpis;
  byDay: { date: string; outgoing: number; incoming: number }[];
  calls: CallRow[];
}

const EMPTY: CallsCrmData = {
  kpis: { total: 0, outgoing: 0, incoming: 0, missed: 0, answered: 0, totalDurationSecs: 0, avgDurationSecs: 0 },
  byDay: [],
  calls: [],
};

interface RawCallRow {
  id: unknown;
  remoteJid: string;
  fromMe: boolean;
  content: string | null;
  raw: unknown;
  messageTimestamp: Date;
  pushName: string | null;
}

export async function getCallsCrmData(params?: {
  days?: number;
  direction?: 'all' | CallDirection;
}): Promise<CallsCrmData> {
  const me = await currentUser();
  const userId = me?.effectiveId ?? me?.ownerId ?? me?.id;
  if (!userId) return EMPTY;

  const days = Math.min(Math.max(params?.days ?? 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000);

  let rows: RawCallRow[] = [];
  try {
    rows = await db.$queryRaw<RawCallRow[]>`
      SELECT m."id", m."remoteJid", m."fromMe", m."content", m."raw", m."messageTimestamp", c."pushName"
      FROM "chat_messages" m
      LEFT JOIN "chat_conversations" c
        ON c."userId" = m."userId" AND c."instanceName" = m."instanceName" AND c."remoteJid" = m."remoteJid"
      WHERE m."userId" = ${userId} AND m."messageType" = 'call' AND m."messageTimestamp" >= ${since}
      ORDER BY m."messageTimestamp" DESC
      LIMIT 1000
    `;
  } catch {
    return EMPTY;
  }

  const calls: CallRow[] = rows.map((r) => {
    const rawObj = r.raw && typeof r.raw === 'object' ? (r.raw as Record<string, any>) : {};
    const callRaw = (rawObj.call ?? {}) as { direction?: string; durationSecs?: number; status?: string; disposition?: string };
    const direction: CallDirection =
      callRaw.direction === 'outgoing' ? 'outgoing'
      : callRaw.direction === 'incoming' ? 'incoming'
      : (r.fromMe ? 'outgoing' : 'incoming');
    const phone = (r.remoteJid || '').split('@')[0].split(':')[0];
    return {
      id: String(r.id),
      direction,
      phone,
      contactName: r.pushName ?? null,
      durationSecs: Number(callRaw.durationSecs ?? 0) || 0,
      status: String(callRaw.status ?? ''),
      disposition: callRaw.disposition ? String(callRaw.disposition) : null,
      ts: new Date(r.messageTimestamp).getTime(),
    };
  });

  const outgoing = calls.filter((c) => c.direction === 'outgoing');
  const incoming = calls.filter((c) => c.direction === 'incoming');
  const answered = outgoing.filter((c) => c.durationSecs > 0);
  const totalDurationSecs = outgoing.reduce((s, c) => s + c.durationSecs, 0);

  const kpis: CallsKpis = {
    total: calls.length,
    outgoing: outgoing.length,
    incoming: incoming.length,
    missed: incoming.length, // entrantes = perdidas (no se contestan por el dispositivo vinculado)
    answered: answered.length,
    totalDurationSecs,
    avgDurationSecs: answered.length ? Math.round(totalDurationSecs / answered.length) : 0,
  };

  const byDayMap = new Map<string, { outgoing: number; incoming: number }>();
  for (const c of calls) {
    const d = new Date(c.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const e = byDayMap.get(key) ?? { outgoing: 0, incoming: 0 };
    if (c.direction === 'outgoing') e.outgoing += 1;
    else e.incoming += 1;
    byDayMap.set(key, e);
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, outgoing: v.outgoing, incoming: v.incoming }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const filtered =
    params?.direction && params.direction !== 'all'
      ? calls.filter((c) => c.direction === params.direction)
      : calls;

  return { kpis, byDay, calls: filtered };
}

/**
 * Guarda/actualiza la disposición (resultado) de una llamada concreta.
 * La llamada es una fila de chat_messages (messageType='call'); el resultado se
 * fusiona dentro de raw.call.disposition sin tocar el resto del JSON.
 */
export async function setCallDisposition(
  callId: string,
  disposition: string,
): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  const userId = me?.effectiveId ?? me?.ownerId ?? me?.id;
  if (!userId) return { success: false, message: 'No autorizado.' };
  if (!isCallDisposition(disposition)) return { success: false, message: 'Resultado inválido.' };

  let id: bigint;
  try {
    id = BigInt(callId);
  } catch {
    return { success: false, message: 'ID de llamada inválido.' };
  }

  try {
    // Sólo la fila del propio usuario y de tipo 'call'.
    const row = await db.chatMessage.findFirst({
      where: { id, userId, messageType: 'call' },
      select: { raw: true },
    });
    if (!row) return { success: false, message: 'Llamada no encontrada.' };

    const rawObj = row.raw && typeof row.raw === 'object' && !Array.isArray(row.raw)
      ? (row.raw as Record<string, unknown>)
      : {};
    const callObj = rawObj.call && typeof rawObj.call === 'object' && !Array.isArray(rawObj.call)
      ? (rawObj.call as Record<string, unknown>)
      : {};
    const nextRaw = { ...rawObj, call: { ...callObj, disposition } };

    await db.chatMessage.update({
      where: { id },
      data: { raw: nextRaw as Prisma.InputJsonValue },
    });
    return { success: true };
  } catch (err) {
    console.error('[setCallDisposition]', err);
    return { success: false, message: 'No se pudo guardar el resultado.' };
  }
}

/**
 * Crea una tarea interna de "volver a llamar" (callback) para el asesor.
 * Usa la tabla `tasks` (sistema interno de tareas), NO el sistema de seguimientos
 * que envía WhatsApp al cliente. dueDate es ISO; se asigna al dueño de la cuenta.
 */
export async function scheduleCallbackAction(input: {
  phone: string;
  contactName?: string | null;
  dueDate: string; // ISO
  note?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  if (!me?.id) return { success: false, message: 'No autorizado.' };
  const ownerId = me.ownerId ?? me.id;

  const digits = (input.phone || '').replace(/\D/g, '');
  if (!digits) return { success: false, message: 'Número inválido.' };

  const due = new Date(input.dueDate);
  if (isNaN(due.getTime())) return { success: false, message: 'Fecha inválida.' };

  const contactJid = `${digits}@s.whatsapp.net`;
  const baseTitle = input.note?.trim()
    ? input.note.trim()
    : `Volver a llamar a ${input.contactName?.trim() || `+${digits}`}`;

  try {
    // Intentar enlazar con la sesión/lead por remoteJid (no es obligatorio).
    const session = await db.session.findFirst({
      where: { userId: ownerId, remoteJid: contactJid },
      select: { id: true, pushName: true },
    });

    await (db as any).task.create({
      data: {
        ownerId,
        assignedToId: ownerId,
        assignedToName: null,
        sessionId: session?.id ?? null,
        contactName: input.contactName?.trim() || session?.pushName || null,
        contactJid,
        title: baseTitle,
        type: 'Llamada',
        dueDate: due,
        status: 'pending',
        createdById: me.id,
      },
    });
    return { success: true };
  } catch (err) {
    console.error('[scheduleCallbackAction]', err);
    return { success: false, message: 'No se pudo agendar el callback.' };
  }
}
