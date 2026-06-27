'use server';

// Integración con AstraCalls (WaCalls) para llamadas de voz por WhatsApp.
// Igual que Evolution: la API key vive en el servidor (env), nunca en el browser.
// El navegador solo hace el WebRTC (micrófono + SDP); la señalización pasa por
// estas acciones y el audio (UDP) va directo al servidor de AstraCalls.

const BASE = (process.env.ASTRACALLS_URL || '').replace(/\/+$/, '');
const KEY = process.env.ASTRACALLS_API_KEY || '';

function headers(): HeadersInit {
  return { 'X-API-Key': KEY, 'Content-Type': 'application/json' };
}

type SessionInfo = { id: string; name: string; jid: string; state: string; paired: boolean };

async function fetchSessions(): Promise<SessionInfo[]> {
  if (!BASE) return [];
  const r = await fetch(`${BASE}/api/sessions`, { headers: headers(), cache: 'no-store' });
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  return (data?.sessions ?? []) as SessionInfo[];
}

// Resuelve la sesión activa (número vinculado y conectado) para llamar.
async function resolveSid(): Promise<string | null> {
  try {
    const sessions = await fetchSessions();
    const open = sessions.find((s) => s.state === 'open') ?? sessions[0];
    return open?.id ?? null;
  } catch {
    return null;
  }
}

export async function getAstraCallStatus(): Promise<{ ready: boolean; jid?: string }> {
  if (!BASE || !KEY) return { ready: false };
  try {
    const open = (await fetchSessions()).find((s) => s.state === 'open');
    return open ? { ready: true, jid: open.jid } : { ready: false };
  } catch {
    return { ready: false };
  }
}

export async function startAstraCall(
  phone: string,
): Promise<{ success: boolean; sid?: string; callId?: string; message?: string }> {
  if (!BASE || !KEY) return { success: false, message: 'Llamadas no configuradas (falta ASTRACALLS_URL/API_KEY).' };
  const sid = await resolveSid();
  if (!sid) return { success: false, message: 'No hay número de WhatsApp vinculado para llamadas.' };
  try {
    const r = await fetch(`${BASE}/api/sessions/${sid}/calls`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ phone, duration_ms: 300_000, record: false }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (r.status === 429) return { success: false, message: 'Límite de llamadas simultáneas alcanzado.' };
      if (r.status === 503) return { success: false, message: 'WhatsApp no está vinculado para llamadas.' };
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
  if (!BASE || !KEY) return { success: false, message: 'Llamadas no configuradas.' };
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

export async function endAstraCall(sid: string, callId: string): Promise<void> {
  if (!BASE || !KEY) return;
  try {
    await fetch(`${BASE}/api/sessions/${sid}/calls/${callId}`, { method: 'DELETE', headers: headers() });
  } catch {
    /* best-effort */
  }
}
