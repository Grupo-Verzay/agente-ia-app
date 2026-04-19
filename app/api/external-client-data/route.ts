import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import {
  buildWhatsAppJidCandidates,
  normalizeWhatsAppConversationJid,
} from '@/lib/whatsapp-jid';
import type { ExternalClientDataRecord } from '@/types/external-client-data';

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim();
  if (!expected) return false;
  const bearer = request.headers.get('authorization');
  const secret = bearer?.startsWith('Bearer ')
    ? bearer.slice(7).trim()
    : (request.headers.get('x-internal-secret') ?? '').trim();
  return secret === expected;
}

// ─── GET /api/external-client-data?userId=X&remoteJid=Y ──────────────────────

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId')?.trim();
  const remoteJid = searchParams.get('remoteJid')?.trim();

  if (!userId || !remoteJid) {
    return NextResponse.json(
      { error: 'userId and remoteJid are required' },
      { status: 400 },
    );
  }

  const candidates = buildWhatsAppJidCandidates(remoteJid);

  const record = await db.externalClientData.findFirst({
    where: { userId, remoteJid: { in: candidates } },
  });

  if (!record) {
    return NextResponse.json({ data: null }, { status: 200 });
  }

  return NextResponse.json({ data: record }, { status: 200 });
}

// ─── POST /api/external-client-data  (upsert) ────────────────────────────────

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { userId?: string; remoteJid?: string; data?: ExternalClientDataRecord; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, remoteJid, data, source = 'api' } = body;

  if (!userId || !remoteJid || !data || typeof data !== 'object') {
    return NextResponse.json(
      { error: 'userId, remoteJid and data are required' },
      { status: 400 },
    );
  }

  const canonicalJid = normalizeWhatsAppConversationJid(remoteJid) || remoteJid;

  const record = await db.externalClientData.upsert({
    where: { userId_remoteJid: { userId, remoteJid: canonicalJid } },
    create: { userId, remoteJid: canonicalJid, data: data as Prisma.InputJsonValue, source },
    update: { data: data as Prisma.InputJsonValue, source, updatedAt: new Date() },
  });

  return NextResponse.json({ data: record }, { status: 200 });
}

// ─── DELETE /api/external-client-data?userId=X&remoteJid=Y ───────────────────

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId')?.trim();
  const remoteJid = searchParams.get('remoteJid')?.trim();

  if (!userId || !remoteJid) {
    return NextResponse.json(
      { error: 'userId and remoteJid are required' },
      { status: 400 },
    );
  }

  const canonicalJid = normalizeWhatsAppConversationJid(remoteJid) || remoteJid;

  try {
    await db.externalClientData.delete({
      where: { userId_remoteJid: { userId, remoteJid: canonicalJid } },
    });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }
}
