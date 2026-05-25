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

  // Buscar seguimientos con UUID como apikey (pending O failed)
  const seguimientos = await db.seguimiento.findMany({
    where: {
      followUpStatus: { in: ['pending', 'failed'] },
      instancia: { not: null },
    },
    select: {
      id: true,
      instancia: true,
      apikey: true,
      idNodo: true,
      time: true,
      followUpStatus: true,
    },
  })

  const withBadKey = seguimientos.filter(
    (s) => s.apikey && UUID_RE.test(s.apikey.trim()),
  )

  const log: string[] = []
  log.push(`Seguimientos con UUID como apikey: ${withBadKey.length} (de ${seguimientos.length} totales)`)

  if (withBadKey.length === 0) {
    log.push('\nResultado: 0 corregidos')
    return NextResponse.json({ ok: true, updated: 0, skipped: 0, log })
  }

  // Agrupar por instancia
  const byInstancia = new Map<string, typeof withBadKey>()
  for (const seg of withBadKey) {
    const key = seg.instancia ?? ''
    if (!key) continue
    if (!byInstancia.has(key)) byInstancia.set(key, [])
    byInstancia.get(key)!.push(seg)
  }

  let totalUpdated = 0
  let totalSkipped = 0
  const now = new Date().toISOString()

  for (const [instanceName, segs] of Array.from(byInstancia.entries())) {
    const instancia = await db.instancia.findFirst({
      where: { instanceName },
      select: { userId: true },
    })

    if (!instancia) {
      log.push(`⚠️  Instancia no encontrada: ${instanceName} — omitiendo ${segs.length}`)
      totalSkipped += segs.length
      continue
    }

    const user = await db.user.findUnique({
      where: { id: instancia.userId },
      select: { apiKey: { select: { key: true } } },
    })

    const correctKey = user?.apiKey?.key?.trim()
    if (!correctKey) {
      log.push(`⚠️  Sin API key para ${instanceName} — omitiendo ${segs.length}`)
      totalSkipped += segs.length
      continue
    }

    // Los failed en el pasado: corregir apikey + resetear a pending con time=ahora para reenvío inmediato
    const failedPast = segs.filter(
      (s: { followUpStatus: string; time: string | null }) =>
        s.followUpStatus === 'failed' && s.time != null && new Date(s.time) < new Date(),
    )
    const rest = segs.filter(
      (s: { id: number }) => !failedPast.find((f: { id: number }) => f.id === s.id),
    )

    if (failedPast.length > 0) {
      await db.seguimiento.updateMany({
        where: { id: { in: failedPast.map((s: { id: number }) => s.id) } },
        data: { apikey: correctKey, followUpStatus: 'pending', followUpAttempt: 0, time: now },
      })
      log.push(`🔁 ${instanceName}: ${failedPast.length} registros failed → reseteados a pending para reenvío`)
      totalUpdated += failedPast.length
    }

    if (rest.length > 0) {
      await db.seguimiento.updateMany({
        where: { id: { in: rest.map((s: { id: number }) => s.id) } },
        data: { apikey: correctKey },
      })
      log.push(`🔧 ${instanceName}: ${rest.length} registros pending corregidos`)
      totalUpdated += rest.length
    }
  }

  log.push(`\nResultado: ${totalUpdated} corregidos/reseteados, ${totalSkipped} sin cambios`)

  return NextResponse.json({ ok: true, updated: totalUpdated, skipped: totalSkipped, log })
}
