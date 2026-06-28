import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { persistChatMessage } from '@/lib/chat-persistence';

// Sincroniza el historial de llamadas de AstraCalls hacia los Chats.
// Registra las llamadas ENTRANTES (perdidas) como burbuja en el chat del
// contacto. Las SALIENTES ya las registra el front en vivo (CallDialog), así que
// aquí se omiten para no duplicar. El dedupe lo garantiza el messageId
// `call_<callId>` (ON CONFLICT en chat_messages).

export const dynamic = 'force-dynamic';

const CRON_HEADER = 'x-cron-secret';
const BASE = (process.env.ASTRACALLS_URL || '').replace(/\/+$/, '');
const KEY = process.env.ASTRACALLS_API_KEY || '';

function authorized(request: NextRequest): boolean {
  const expected = (process.env.CRON_SECRET ?? '').trim();
  if (!expected) return false;
  const bearer = request.headers.get('authorization');
  const token = bearer?.toLowerCase().startsWith('bearer ')
    ? bearer.slice(7).trim()
    : '';
  return (token || (request.headers.get(CRON_HEADER) ?? '').trim()) === expected;
}

type AstraSession = { id: string; name?: string; jid?: string; state?: string };
type AstraCall = {
  callId: string;
  direction?: string; // 'inbound' | 'outbound'
  peer?: string;
  startedAt?: number; // epoch ms
  endedAt?: number; // epoch ms
  status?: string;
  endReason?: string;
};

async function syncAstraCalls() {
  const headers = { 'X-API-Key': KEY };
  let sessions = 0;
  let logged = 0;

  const sRes = await fetch(`${BASE}/api/sessions`, { headers, cache: 'no-store' });
  if (!sRes.ok) return { sessions, logged, error: `sessions ${sRes.status}` };
  const sData = await sRes.json().catch(() => ({}));
  const list: AstraSession[] = sData?.sessions ?? [];

  for (const s of list) {
    if (!s?.id) continue;
    sessions++;

    // Usuario dueño de esta sesión de llamadas.
    const user = await db.user.findFirst({
      where: { astraCallsSid: s.id },
      select: { id: true },
    });
    if (!user) continue;

    // Instancia de WhatsApp (Evolution) del usuario: para que la burbuja caiga
    // en el mismo chat que la mensajería.
    const inst = await db.instancia.findFirst({
      where: { userId: user.id, instanceType: 'Whatsapp' },
      select: { instanceName: true },
    });
    if (!inst?.instanceName) continue;

    const hRes = await fetch(`${BASE}/api/sessions/${s.id}/history`, {
      headers,
      cache: 'no-store',
    });
    if (!hRes.ok) continue;
    const hData = await hRes.json().catch(() => ({}));
    const rows: AstraCall[] = hData?.rows ?? [];

    for (const c of rows) {
      if (!c?.callId) continue;
      if (c.direction !== 'inbound') continue; // salientes ya registradas por el front
      const peer = c.peer || '';
      if (!peer) continue;
      const remoteJid = peer.includes('@') ? peer : `${peer}@s.whatsapp.net`;
      const durationSecs =
        c.endedAt && c.startedAt
          ? Math.max(0, Math.round((c.endedAt - c.startedAt) / 1000))
          : 0;

      await persistChatMessage({
        userId: user.id,
        instanceName: inst.instanceName,
        instanceType: 'evolution',
        remoteJid,
        messageId: `call_${c.callId}`,
        fromMe: false,
        messageType: 'call',
        content: 'Llamada perdida',
        raw: {
          call: {
            direction: 'incoming',
            durationSecs,
            status: c.status ?? '',
            endReason: c.endReason ?? '',
          },
        },
        messageTimestamp: c.startedAt ? new Date(c.startedAt) : undefined,
      });
      logged++;
    }
  }

  return { sessions, logged };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
  }
  if (!BASE || !KEY) {
    return NextResponse.json({ success: true, skipped: true, message: 'AstraCalls no configurado' });
  }
  try {
    const result = await syncAstraCalls();
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message ?? 'error' }, { status: 200 });
  }
}
