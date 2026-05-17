import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: { instanceName: string } },
) {
  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  const secret = process.env.BAILEYS_SECRET;

  if (!backendUrl || !secret) {
    return NextResponse.json({ error: 'Backend no configurado' }, { status: 503 });
  }

  const url = `${backendUrl}/whatsapp/baileys/status/${encodeURIComponent(params.instanceName)}`;

  const res = await fetch(url, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  });

  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}
