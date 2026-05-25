import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim()
  if (!expected) return false
  const bearer = request.headers.get('authorization')
  const secret = bearer?.startsWith('Bearer ')
    ? bearer.slice(7).trim()
    : (request.headers.get('x-internal-secret') ?? '').trim()
  return secret === expected
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Obtener TODOS los seguimientos pendientes con apikey que parece un UUID (incorrecto)
  const seguimientos = await db.seguimiento.findMany({
    where: {
      followUpStatus: 'pending',
      instancia: { not: null },
    },
    select: {
      id: true,
      instancia: true,
      apikey: true,
      idNodo: true,
      time: true,
    },
  })

  // Filtrar solo los que tienen UUID como apikey
  const withBadKey = seguimientos.filter(
    (s) => s.apikey && UUID_RE.test(s.apikey.trim()),
  )

  const log: string[] = []
  log.push(`Seguimientos pendientes totales: ${seguimientos.length}`)
  log.push(`Con UUID como apikey (incorrecto): ${withBadKey.length}`)

  if (withBadKey.length === 0) {
    log.push('\nResultado: 0 corregidos, 0 sin cambios')
    return NextResponse.json({ ok: true, updated: 0, skipped: 0, log })
  }

  // Agrupar por instancia para minimizar queries a BD
  const byInstancia = new Map<string, typeof withBadKey>()
  for (const seg of withBadKey) {
    const key = seg.instancia ?? ''
    if (!key) continue
    if (!byInstancia.has(key)) byInstancia.set(key, [])
    byInstancia.get(key)!.push(seg)
  }

  let totalUpdated = 0
  let totalSkipped = 0

  for (const [instanceName, segs] of Array.from(byInstancia.entries())) {
    const instancia = await db.instancia.findFirst({
      where: { instanceName },
      select: { userId: true },
    })

    if (!instancia) {
      log.push(`⚠️  Instancia no encontrada: ${instanceName} — omitiendo ${segs.length} registros`)
      totalSkipped += segs.length
      continue
    }

    const user = await db.user.findUnique({
      where: { id: instancia.userId },
      select: {
        apiKey: { select: { key: true } },
      },
    })

    const correctKey = user?.apiKey?.key?.trim()
    if (!correctKey) {
      log.push(`⚠️  Sin API key para instancia ${instanceName} (userId=${instancia.userId}) — omitiendo ${segs.length} registros`)
      totalSkipped += segs.length
      continue
    }

    const result = await db.seguimiento.updateMany({
      where: { id: { in: segs.map((s: { id: number }) => s.id) } },
      data: { apikey: correctKey },
    })

    log.push(`🔧 ${instanceName}: ${result.count} registros corregidos`)
    totalUpdated += result.count
  }

  log.push(`\nResultado: ${totalUpdated} corregidos, ${totalSkipped} sin cambios`)

  return NextResponse.json({
    ok: true,
    updated: totalUpdated,
    skipped: totalSkipped,
    log,
  })
}
