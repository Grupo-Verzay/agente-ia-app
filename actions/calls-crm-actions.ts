'use server';

// CRM de Llamadas: lee las llamadas registradas en chat_messages (messageType
// 'call') y devuelve KPIs + serie por día + lista, para el dashboard de llamadas.
// Las salientes las registra el front en vivo; las entrantes el backend (evento
// CALL de Evolution). Aquí solo se LEE y agrega.

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

export type CallDirection = 'incoming' | 'outgoing';

export interface CallRow {
  id: string;
  direction: CallDirection;
  phone: string;
  contactName: string | null;
  durationSecs: number;
  status: string;
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
    const callRaw = (rawObj.call ?? {}) as { direction?: string; durationSecs?: number; status?: string };
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
