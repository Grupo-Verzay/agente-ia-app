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
  hasRecording: boolean;
  recordingUrl: string | null;
  transcript: string | null;
  summary: string | null;
  leadSynthesis: string | null; // "Detalle del lead (síntesis)" = summarySnapshot del lead
  astraSid: string | null;
  astraCallId: string | null;
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
  // Las llamadas pueden quedar guardadas bajo cualquiera de los ids ligados al
  // usuario (cuenta activa, dueño del equipo, la propia o la sesión real del
  // admin). Leemos bajo TODOS para que el historial no desaparezca al cambiar de
  // cuenta/equipo. Son ids de su propia identidad, no hay fuga entre clientes.
  const scopeIds = Array.from(
    new Set(
      [me?.effectiveId, me?.ownerId, me?.id, (me as any)?.sessionUserId].filter(Boolean),
    ),
  ) as string[];
  if (scopeIds.length === 0) return EMPTY;

  const days = Math.min(Math.max(params?.days ?? 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000);

  let rows: RawCallRow[] = [];
  try {
    rows = await db.$queryRaw<RawCallRow[]>`
      SELECT m."id", m."remoteJid", m."fromMe", m."content", m."raw", m."messageTimestamp", c."pushName"
      FROM "chat_messages" m
      LEFT JOIN "chat_conversations" c
        ON c."userId" = m."userId" AND c."instanceName" = m."instanceName" AND c."remoteJid" = m."remoteJid"
      WHERE m."userId" IN (${Prisma.join(scopeIds)}) AND m."messageType" = 'call' AND m."messageTimestamp" >= ${since}
      ORDER BY m."messageTimestamp" DESC
      LIMIT 1000
    `;
  } catch (err) {
    console.error('[getCallsCrmData]', err);
    return EMPTY;
  }

  const calls: CallRow[] = rows.map((r) => {
    const rawObj = r.raw && typeof r.raw === 'object' ? (r.raw as Record<string, any>) : {};
    const callRaw = (rawObj.call ?? {}) as {
      direction?: string;
      durationSecs?: number;
      status?: string;
      disposition?: string;
      hasRecording?: boolean;
      recordingUrl?: string | null;
      transcript?: string | null;
      summary?: string | null;
      astraSid?: string;
      astraCallId?: string;
    };
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
      hasRecording: Boolean(callRaw.hasRecording),
      recordingUrl: callRaw.recordingUrl ? String(callRaw.recordingUrl) : null,
      transcript: callRaw.transcript ? String(callRaw.transcript) : null,
      summary: callRaw.summary ? String(callRaw.summary) : null,
      leadSynthesis: null as string | null,
      astraSid: callRaw.astraSid ? String(callRaw.astraSid) : null,
      astraCallId: callRaw.astraCallId ? String(callRaw.astraCallId) : null,
      ts: new Date(r.messageTimestamp).getTime(),
    };
  });

  // Síntesis del lead ("Detalle del lead") por teléfono: sesión → último follow-up
  // con summarySnapshot. En lote para no hacer N consultas.
  try {
    const phones = Array.from(new Set(calls.map((c) => c.phone).filter(Boolean)));
    if (phones.length > 0) {
      const jids = phones.map((p) => `${p}@s.whatsapp.net`);
      const sessions = await db.session.findMany({
        where: { userId: { in: scopeIds }, remoteJid: { in: jids } },
        select: { id: true, remoteJid: true },
      });
      if (sessions.length > 0) {
        const sessionIds = sessions.map((s) => s.id);
        const sessionIdToJid = new Map(sessions.map((s) => [s.id, s.remoteJid]));

        // 1) Síntesis manual (summarySnapshot del último follow-up).
        const followUps = await db.crmFollowUp.findMany({
          where: { sessionId: { in: sessionIds }, summarySnapshot: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { sessionId: true, summarySnapshot: true },
        });
        const jidToSynthesis = new Map<string, string>();
        for (const f of followUps) {
          const jid = f.sessionId != null ? sessionIdToJid.get(f.sessionId) : undefined;
          if (jid && !jidToSynthesis.has(jid) && f.summarySnapshot?.trim()) {
            jidToSynthesis.set(jid, f.summarySnapshot.trim());
          }
        }

        // 2) Respaldo: resumen automático del lead (último Registro), como en Registros.
        const registros = await db.registro
          .findMany({
            where: { sessionId: { in: sessionIds } },
            orderBy: { createdAt: 'desc' },
            select: { sessionId: true, resumen: true, detalles: true },
          })
          .catch(() => [] as { sessionId: number; resumen: string | null; detalles: string | null }[]);
        const jidToResumen = new Map<string, string>();
        for (const r of registros) {
          const jid = sessionIdToJid.get(r.sessionId);
          const txt = (r.resumen || r.detalles || '').trim();
          if (jid && !jidToResumen.has(jid) && txt) jidToResumen.set(jid, txt);
        }

        for (const c of calls) {
          const jid = `${c.phone}@s.whatsapp.net`;
          c.leadSynthesis = jidToSynthesis.get(jid) ?? jidToResumen.get(jid) ?? null;
        }
      }
    }
  } catch (err) {
    console.error('[getCallsCrmData] síntesis', err);
  }

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
  const scopeIds = Array.from(
    new Set([me?.effectiveId, me?.ownerId, me?.id].filter(Boolean)),
  ) as string[];
  if (scopeIds.length === 0) return { success: false, message: 'No autorizado.' };
  if (!isCallDisposition(disposition)) return { success: false, message: 'Resultado inválido.' };

  let id: bigint;
  try {
    id = BigInt(callId);
  } catch {
    return { success: false, message: 'ID de llamada inválido.' };
  }

  try {
    // Sólo la fila del propio usuario/equipo y de tipo 'call'.
    const row = await db.chatMessage.findFirst({
      where: { id, userId: { in: scopeIds }, messageType: 'call' },
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

/** Elimina las llamadas perdidas/entrantes del historial del usuario. */
export async function clearMissedCallsAction(): Promise<{ success: boolean; deleted?: number; message?: string }> {
  const me = await currentUser();
  const scopeIds = Array.from(
    new Set([me?.effectiveId, me?.ownerId, me?.id].filter(Boolean)),
  ) as string[];
  if (scopeIds.length === 0) return { success: false, message: 'No autorizado.' };
  try {
    const res = await db.chatMessage.deleteMany({
      where: { userId: { in: scopeIds }, messageType: 'call', fromMe: false },
    });
    return { success: true, deleted: res.count };
  } catch (err) {
    console.error('[clearMissedCallsAction]', err);
    return { success: false, message: 'No se pudieron limpiar las llamadas perdidas.' };
  }
}

/** Elimina una llamada concreta del historial. */
export async function deleteCallAction(callId: string): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  const scopeIds = Array.from(
    new Set([me?.effectiveId, me?.ownerId, me?.id, (me as any)?.sessionUserId].filter(Boolean)),
  ) as string[];
  if (scopeIds.length === 0) return { success: false, message: 'No autorizado.' };
  let id: bigint;
  try {
    id = BigInt(callId);
  } catch {
    return { success: false, message: 'ID inválido.' };
  }
  try {
    await db.chatMessage.deleteMany({ where: { id, userId: { in: scopeIds }, messageType: 'call' } });
    return { success: true };
  } catch (err) {
    console.error('[deleteCallAction]', err);
    return { success: false, message: 'No se pudo eliminar la llamada.' };
  }
}

/** Elimina TODAS las llamadas del historial del usuario. */
export async function deleteAllCallsAction(): Promise<{ success: boolean; deleted?: number; message?: string }> {
  const me = await currentUser();
  const scopeIds = Array.from(
    new Set([me?.effectiveId, me?.ownerId, me?.id, (me as any)?.sessionUserId].filter(Boolean)),
  ) as string[];
  if (scopeIds.length === 0) return { success: false, message: 'No autorizado.' };
  try {
    const res = await db.chatMessage.deleteMany({ where: { userId: { in: scopeIds }, messageType: 'call' } });
    return { success: true, deleted: res.count };
  } catch (err) {
    console.error('[deleteAllCallsAction]', err);
    return { success: false, message: 'No se pudieron eliminar las llamadas.' };
  }
}

/**
 * Resuelve el sessionId del lead asociado a un número de teléfono, para poder
 * abrir/editar la síntesis del lead desde el detalle de una llamada.
 * Usa el mismo scope de dueño que el resto del módulo de llamadas.
 */
export async function getSessionIdByPhone(phone: string): Promise<number | null> {
  const me = await currentUser();
  const ownerId = me?.effectiveId ?? me?.ownerId ?? me?.id;
  if (!ownerId) return null;
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  try {
    const session = await db.session.findFirst({
      where: { userId: ownerId, remoteJid: `${digits}@s.whatsapp.net` },
      select: { id: true },
    });
    return session?.id ?? null;
  } catch (err) {
    console.error('[getSessionIdByPhone]', err);
    return null;
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

/** Diagnóstico: cuántas llamadas hay por cada id del usuario, la última y las instancias. */
export async function diagnoseCallsAction(): Promise<{
  scopeIds: string[];
  perScope: { id: string; calls: number }[];
  totalInScope: number;
  lastCall: { ts: number; userId: string; content: string } | null;
  instances: { instanceName: string | null; instanceType: string | null }[];
}> {
  const me = await currentUser();
  const scopeIds = Array.from(
    new Set([me?.effectiveId, me?.ownerId, me?.id, (me as any)?.sessionUserId].filter(Boolean)),
  ) as string[];
  const perScope: { id: string; calls: number }[] = [];
  for (const id of scopeIds) {
    const calls = await db.chatMessage.count({ where: { userId: id, messageType: 'call' } }).catch(() => 0);
    perScope.push({ id, calls });
  }
  const totalInScope = await db.chatMessage
    .count({ where: { userId: { in: scopeIds }, messageType: 'call' } })
    .catch(() => 0);
  const last = await db.chatMessage
    .findFirst({
      where: { userId: { in: scopeIds }, messageType: 'call' },
      orderBy: { messageTimestamp: 'desc' },
      select: { messageTimestamp: true, userId: true, content: true },
    })
    .catch(() => null);
  const insts = await db.instancia
    .findMany({ where: { userId: { in: scopeIds } }, select: { instanceName: true, instanceType: true } })
    .catch(() => [] as { instanceName: string | null; instanceType: string | null }[]);
  return {
    scopeIds,
    perScope,
    totalInScope,
    lastCall: last
      ? { ts: new Date(last.messageTimestamp).getTime(), userId: last.userId, content: last.content ?? '' }
      : null,
    instances: insts.map((i) => ({ instanceName: i.instanceName ?? null, instanceType: i.instanceType ?? null })),
  };
}

// NO exportar (este archivo es 'use server': solo puede exportar funciones async).
const CALL_LEAD_STATUSES = ['FRIO', 'TIBIO', 'CALIENTE', 'FINALIZADO', 'DESCARTADO'] as const;

/**
 * Cambia el estado del lead asociado al número de la llamada, directamente desde
 * el CRM de llamadas. Si aún no existe lead/sesión para ese número, lo crea
 * (lead mínimo) para que aparezca en el CRM. Pasa null para quitar el estado.
 */
export async function setCallLeadStatusAction(input: {
  phone: string;
  contactName?: string | null;
  leadStatus: string | null;
}): Promise<{ success: boolean; message?: string; created?: boolean }> {
  const me = await currentUser();
  const ownerId = me?.ownerId ?? me?.id;
  if (!ownerId) return { success: false, message: 'No autorizado.' };

  const status = input.leadStatus;
  if (status && !CALL_LEAD_STATUSES.includes(status as (typeof CALL_LEAD_STATUSES)[number])) {
    return { success: false, message: 'Estado inválido.' };
  }
  const digits = (input.phone || '').replace(/\D/g, '');
  if (!digits) return { success: false, message: 'Número inválido.' };
  const remoteJid = `${digits}@s.whatsapp.net`;

  try {
    const existing = await db.session.findFirst({
      where: { userId: ownerId, remoteJid },
      select: { id: true },
    });

    if (existing) {
      await db.session.update({
        where: { id: existing.id },
        data: { leadStatus: (status as any) ?? null, leadStatusUpdatedAt: new Date() },
      });
      return { success: true };
    }

    // No existe lead: crear uno mínimo para no perder el contacto de la llamada.
    const user = await db.user.findUnique({
      where: { id: ownerId },
      select: { instancias: { where: { instanceType: 'Whatsapp' }, select: { instanceId: true }, take: 1 } },
    });
    const instanceId = user?.instancias?.[0]?.instanceId;
    if (!instanceId) return { success: false, message: 'No hay instancia de WhatsApp para crear el lead.' };

    await db.session.create({
      data: {
        userId: ownerId,
        remoteJid,
        pushName: input.contactName?.trim() || `+${digits}`,
        instanceId,
        status: true,
        leadStatus: (status as any) ?? null,
        leadStatusUpdatedAt: new Date(),
      },
    });
    return { success: true, created: true };
  } catch (err) {
    console.error('[setCallLeadStatusAction]', err);
    return { success: false, message: 'No se pudo actualizar el estado del lead.' };
  }
}
