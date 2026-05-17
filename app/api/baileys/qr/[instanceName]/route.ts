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

  const url = `${backendUrl}/whatsapp/baileys/qr/${encodeURIComponent(params.instanceName)}`;

  const res = await fetch(url, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    return new NextResponse(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  }

  const contentType = res.headers.get('Content-Type') ?? 'application/octet-stream';

  if (contentType.includes('image/png')) {
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  }

  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}
