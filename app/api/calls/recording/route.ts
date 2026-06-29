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

  // Reenvía el Range del navegador para permitir duración/seek en el reproductor.
  const range = req.headers.get('range');
  const upstream = await fetch(`${BASE}/api/sessions/${sid}/calls/${callId}/recording`, {
    headers: { 'X-API-Key': KEY, ...(range ? { Range: range } : {}) },
    cache: 'no-store',
  });
  if ((!upstream.ok && upstream.status !== 206) || !upstream.body) {
    return NextResponse.json({ error: 'no recording' }, { status: 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', 'audio/wav');
  headers.set('Cache-Control', 'private, max-age=3600');
  // Pasa cabeceras de tamaño/rango para que el navegador muestre la duración.
  for (const h of ['content-length', 'content-range', 'accept-ranges']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
