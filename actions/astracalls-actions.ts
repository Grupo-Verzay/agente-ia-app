'use server';

// Integración con AstraCalls (WaCalls) para llamadas de voz por WhatsApp.
// Igual que Evolution: la API key vive en el servidor (env), nunca en el browser,
// y CADA usuario vincula su propio número (sesión propia con su QR).
// El navegador solo hace el WebRTC (micrófono + SDP); el audio (UDP) va directo
// al servidor de AstraCalls.

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { persistChatMessage } from '@/lib/chat-persistence';

const BASE = (process.env.ASTRACALLS_URL || '').replace(/\/+$/, '');
const KEY = process.env.ASTRACALLS_API_KEY || '';

function headers(): HeadersInit {
  return { 'X-API-Key': KEY, 'Content-Type': 'application/json' };
}

function configured(): boolean {
  return !!BASE && !!KEY;
}

type SessionInfo = { id: string; name: string; jid: string; state: string; paired: boolean };

async function fetchSessions(): Promise<SessionInfo[]> {
  if (!configured()) return [];
  try {
    const r = await fetch(`${BASE}/api/sessions`, { headers: headers(), cache: 'no-store' });
    if (!r.ok) return [];
    const data = await r.json().catch(() => ({}));
    return (data?.sessions ?? []) as SessionInfo[];
  } catch {
    return [];
  }
}

// sid de llamadas del usuario actual (su número vinculado).
async function getMySid(): Promise<string | null> {
  const me = await currentUser();
  if (!me?.id) return null;
  const u = await db.user.findUnique({ where: { id: me.id }, select: { astraCallsSid: true } });
  return u?.astraCallsSid ?? null;
}

/* ── Estado de la sesión de llamadas del usuario ───────────────────────── */
export async function getMyCallSession(): Promise<{
  configured: boolean;
  linked: boolean;
  state?: string;
  jid?: string;
  name?: string;
}> {
  if (!configured()) return { configured: false, linked: false };
  const sid = await getMySid();
  if (!sid) return { configured: true, linked: false };
  const s = (await fetchSessions()).find((x) => x.id === sid);
  if (!s) return { configured: true, linked: false };
  return { configured: true, linked: true, state: s.state, jid: s.jid, name: s.name };
}

/* ── Crear/asegurar la sesión del usuario y disparar el emparejamiento ──── */
export async function linkMyCallSession(): Promise<{ success: boolean; sid?: string; message?: string }> {
  if (!configured()) return { success: false, message: 'Llamadas no configuradas.' };
  const me = await currentUser();
  if (!me?.id) return { success: false, message: 'No autorizado.' };

  // ¿Ya tiene una sesión válida?
  let sid = await getMySid();
  if (sid) {
    const exists = (await fetchSessions()).some((x) => x.id === sid);
    if (!exists) sid = null;
  }

  // Crear sesión nueva si no tiene
  if (!sid) {
    // Nombre legible: instancia WhatsApp > empresa > nombre > email
    const [inst, u] = await Promise.all([
      db.instancia.findFirst({ where: { userId: me.id, instanceType: 'Whatsapp' }, select: { instanceName: true } }),
      db.user.findUnique({ where: { id: me.id }, select: { company: true, name: true } }),
    ]);
    const sessionName = inst?.instanceName || u?.company || u?.name || me.email || me.id;
    try {
      const r = await fetch(`${BASE}/api/sessions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name: sessionName }),
      });
      if (!r.ok) return { success: false, message: `No se pudo crear la sesión (${r.status}).` };
      const data = await r.json().catch(() => ({}));
      sid = data?.id as string | undefined ?? null;
      if (!sid) return { success: false, message: 'Respuesta inválida al crear sesión.' };
      await db.user.update({ where: { id: me.id }, data: { astraCallsSid: sid } });
    } catch (e: any) {
      return { success: false, message: e?.message || 'Error creando la sesión.' };
    }
  }

  // Disparar emparejamiento (genera QR)
  try {
    await fetch(`${BASE}/api/sessions/${sid}/pair`, { method: 'POST', headers: headers(), body: '{}' });
  } catch {
    /* el QR igual llega por el stream */
  }
  return { success: true, sid };
}

/* ── Capturar el QR (o estado) por el stream SSE, del lado del servidor ─── */
export async function getMyCallQr(): Promise<{ qr?: string; state?: string; message?: string }> {
  if (!configured()) return { message: 'Llamadas no configuradas.' };
  const sid = await getMySid();
  if (!sid) return { message: 'Sin sesión. Pulsa Vincular primero.' };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const clientId = `srv-${sid}-${Date.now()}`;
    const r = await fetch(
      `${BASE}/api/events?clientId=${encodeURIComponent(clientId)}&apiKey=${encodeURIComponent(KEY)}`,
      { signal: ctrl.signal, headers: { Accept: 'text/event-stream' }, cache: 'no-store' },
    );
    if (!r.ok || !r.body) return { message: 'No se pudo abrir el stream de QR.' };

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const ev = JSON.parse(payload);
          if (ev?.sessionId !== sid) continue;
          if (ev.type === 'auth-state' && ev.state === 'open') return { state: 'open' };
          if ((ev.type === 'session-qr' || ev.type === 'auth-state') && ev.qr) {
            return { qr: ev.qr as string, state: ev.state };
          }
        } catch {
          /* ignore malformed */
        }
      }
    }
    return { message: 'Esperando QR…' };
  } catch {
    return { message: 'Tiempo de espera del QR agotado.' };
  } finally {
    clearTimeout(timeout);
    try { ctrl.abort(); } catch { /* ignore */ }
  }
}

/* ── Desvincular ───────────────────────────────────────────────────────── */
export async function unlinkMyCallSession(): Promise<{ success: boolean }> {
  const me = await currentUser();
  if (!me?.id) return { success: false };
  const sid = await getMySid();
  if (configured() && sid) {
    try { await fetch(`${BASE}/api/sessions/${sid}/logout`, { method: 'POST', headers: headers(), body: '{}' }); } catch { /* */ }
    try { await fetch(`${BASE}/api/sessions/${sid}`, { method: 'DELETE', headers: headers() }); } catch { /* */ }
  }
  await db.user.update({ where: { id: me.id }, data: { astraCallsSid: null } });
  return { success: true };
}

/* ── Llamadas (usan la sesión del usuario actual) ──────────────────────── */
export async function startAstraCall(
  phone: string,
): Promise<{ success: boolean; sid?: string; callId?: string; message?: string }> {
  if (!configured()) return { success: false, message: 'Llamadas no configuradas.' };
  const sid = await getMySid();
  if (!sid) return { success: false, message: 'No tienes un número vinculado para llamar. Vincúlalo en Conexión → Llamadas.' };
  try {
    const r = await fetch(`${BASE}/api/sessions/${sid}/calls`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ phone, duration_ms: 300_000, record: false }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (r.status === 429) return { success: false, message: 'Límite de llamadas simultáneas alcanzado.' };
      if (r.status === 503) return { success: false, message: 'Tu número no está vinculado/conectado para llamadas.' };
      return { success: false, message: `No se pudo iniciar la llamada (${r.status}). ${t}`.trim() };
    }
    const data = await r.json().catch(() => ({}));
    const callId = data?.call?.callId as string | undefined;
    if (!callId) return { success: false, message: 'Respuesta inválida del servidor de llamadas.' };
    return { success: true, sid, callId };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error iniciando la llamada.' };
  }
}

export async function astraCallWebrtc(
  sid: string,
  callId: string,
  sdpOffer: string,
): Promise<{ success: boolean; sdpAnswer?: string; message?: string }> {
  if (!configured()) return { success: false, message: 'Llamadas no configuradas.' };
  try {
    const r = await fetch(`${BASE}/api/sessions/${sid}/calls/${callId}/webrtc`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ sdp_offer: sdpOffer }),
    });
    if (!r.ok) return { success: false, message: `Conexión de audio falló (${r.status}).` };
    const data = await r.json().catch(() => ({}));
    const sdpAnswer = data?.sdp_answer as string | undefined;
    if (!sdpAnswer) return { success: false, message: 'No se recibió respuesta de audio.' };
    return { success: true, sdpAnswer };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error de audio.' };
  }
}

/** Registra en los Chats una llamada SALIENTE hecha desde la app (burbuja "Llamada realizada"). */
export async function logOutgoingCallAction(
  phone: string,
  durationSecs: number,
  isVideo = false,
): Promise<void> {
  try {
    const me = await currentUser();
    const userId = me?.ownerId ?? me?.id;
    if (!userId) return;
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return;
    const inst = await db.instancia.findFirst({
      where: { userId, instanceType: 'Whatsapp' },
      select: { instanceName: true },
    });
    if (!inst?.instanceName) return;
    await persistChatMessage({
      userId,
      instanceName: inst.instanceName,
      instanceType: 'evolution',
      remoteJid: `${digits}@s.whatsapp.net`,
      messageId: `callout_${Date.now()}_${digits}`,
      fromMe: true,
      messageType: 'call',
      content: isVideo ? 'Videollamada realizada' : 'Llamada realizada',
      raw: { call: { direction: 'outgoing', isVideo, durationSecs } },
      messageTimestamp: new Date(),
    });
  } catch {
    /* best-effort, nunca rompe la llamada */
  }
}

export async function endAstraCall(sid: string, callId: string): Promise<void> {
  if (!configured()) return;
  try {
    await fetch(`${BASE}/api/sessions/${sid}/calls/${callId}`, { method: 'DELETE', headers: headers() });
  } catch {
    /* best-effort */
  }
}
