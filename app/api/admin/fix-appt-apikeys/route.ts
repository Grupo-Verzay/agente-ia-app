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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Obtener todos los seguimientos de citas pendientes con apikey posiblemente incorrecto
  const seguimientos = await db.seguimiento.findMany({
    where: {
      OR: [
        { idNodo: { startsWith: 'appt-confirm-' } },
        { idNodo: { startsWith: 'appt-reminder-' } },
      ],
      followUpStatus: 'pending',
    },
    select: {
      id: true,
      instancia: true,
      apikey: true,
      idNodo: true,
      time: true,
    },
  })

  const log: string[] = []
  log.push(`Seguimientos de citas pendientes encontrados: ${seguimientos.length}`)

  // Agrupar por instancia para minimizar queries a BD
  const byInstancia = new Map<string, typeof seguimientos>()
  for (const seg of seguimientos) {
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
      select: { userId: true, instanceId: true },
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

    // Solo actualizar los que tienen un apikey diferente al correcto
    const toUpdate = segs.filter((s: { apikey: string | null }) => s.apikey?.trim() !== correctKey)

    if (toUpdate.length === 0) {
      log.push(`✅ ${instanceName}: todos los registros ya tienen la API key correcta (${segs.length})`)
      totalSkipped += segs.length
      continue
    }

    const result = await db.seguimiento.updateMany({
      where: { id: { in: toUpdate.map((s: { id: number }) => s.id) } },
      data: { apikey: correctKey },
    })

    log.push(`🔧 ${instanceName}: ${result.count} registros corregidos (de ${segs.length})`)
    totalUpdated += result.count
    totalSkipped += segs.length - result.count
  }

  log.push(`\nResultado: ${totalUpdated} corregidos, ${totalSkipped} sin cambios`)

  return NextResponse.json({
    ok: true,
    updated: totalUpdated,
    skipped: totalSkipped,
    log,
  })
}
