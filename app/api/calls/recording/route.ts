import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const BASE = (process.env.ASTRACALLS_URL || '').replace(/\/+$/, '');
const KEY = process.env.ASTRACALLS_API_KEY || '';

/**
 * Proxy autenticado del WAV grabado por AstraCalls. El navegador pide
 * /api/calls/recording?sid=..&callId=.. (con la sesión de la app) y el servidor
 * lo descarga de AstraCalls con la API key, que nunca llega al cliente.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!BASE || !KEY) return NextResponse.json({ error: 'not configured' }, { status: 404 });

  const sid = req.nextUrl.searchParams.get('sid') || '';
  const callId = req.nextUrl.searchParams.get('callId') || '';
  if (!sid || !callId || /[^A-Za-z0-9_.\-]/.test(sid) || /[^A-Za-z0-9_.\-]/.test(callId)) {
    return NextResponse.json({ error: 'bad params' }, { status: 400 });
  }

  const upstream = await fetch(`${BASE}/api/sessions/${sid}/calls/${callId}/recording`, {
    headers: { 'X-API-Key': KEY },
    cache: 'no-store',
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'no recording' }, { status: 404 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
