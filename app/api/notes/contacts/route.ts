import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  const q = req.nextUrl.searchParams.get('q') ?? ''

  if (!userId) return NextResponse.json({ data: [] })

  // Verifica que el usuario de la sesión tenga permiso sobre este userId
  // (evita enumerar contactos/teléfonos de otro tenant — IDOR).
  try {
    await assertCanAccessTargetUser(userId)
  } catch {
    return NextResponse.json({ data: [] }, { status: 403 })
  }

  try {
    const sessions = await db.session.findMany({
      where: {
        userId,
        ...(q.trim() ? {
          OR: [
            { pushName: { contains: q, mode: 'insensitive' } },
            { remoteJid: { contains: q } },
          ],
        } : {}),
      },
      select: { remoteJid: true, pushName: true },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    })

    const unique = Array.from(
      new Map(sessions.map(s => [s.remoteJid, s])).values()
    )

    return NextResponse.json({ data: unique })
  } catch {
    return NextResponse.json({ data: [] })
  }
}
