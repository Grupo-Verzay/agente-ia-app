import { sendQrDisconnectedNotification } from '@/actions/api-action'
import { db } from '@/lib/db'
import {
  estadoDeLaSesionDeLaLinea,
  proveedorDeLaFila,
} from '@/lib/sesion-de-la-linea'
import {
  DISCONNECT_COOLDOWN_MS,
  getDayKeyBogota,
  getEvoCache,
} from '@/types/evo-api'
import { NextResponse } from 'next/server'

const CRON_HEADER = 'x-cron-secret'
const NOTIFICATION_HOURS = [9, 13, 17]

function getRequestSecret(request: Request): string {
  const bearer = request.headers.get('authorization')
  if (bearer?.startsWith('Bearer ')) return bearer.slice('Bearer '.length).trim()
  return (request.headers.get(CRON_HEADER) ?? '').trim()
}

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRON_SECRET ?? '').trim()
  if (!expected) return false
  return getRequestSecret(request) === expected
}

function normalizeBaseUrl(url: string | null | undefined): string {
  const value = (url ?? '').trim().replace(/\/+$/, '')
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function getBogotaHour(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'America/Bogota',
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  return hour === 24 ? 0 : hour
}

async function runEvolutionDisconnectScan() {
  const now = Date.now()
  const currentHour = getBogotaHour(new Date(now))
  const todayKey = getDayKeyBogota(now)
  const cache = getEvoCache()

  if (!NOTIFICATION_HOURS.includes(currentHour)) {
    return {
      success: true,
      message: `Fuera de horario. Horarios: ${NOTIFICATION_HOURS.join(', ')}.`,
      currentHour,
      scanned: 0,
      disconnected: 0,
      notified: 0,
      skipped: 0,
      failed: 0,
      failures: [] as Array<{ userId: string; instanceName: string; message: string }>,
    }
  }

  // Las lineas por QR son de DOS proveedores y las dos se caen igual.
  //
  // Antes este aviso no existia para WhatsApp Mensajeria, y por partida doble:
  // el filtro pedia `instanceType` nulo o `Whatsapp` -o sea, dejaba fuera las
  // filas `waha`- y ademas exigia `apiKey: { isNot: null }`, la clave de
  // Evolution, que una cuenta con su linea en Waha normalmente no tiene. Asi
  // que a esos clientes la linea se les caia y **no se enteraba nadie**: ni un
  // aviso, ni una fila en el resultado del cron, ni un fallo que mirar.
  const LINEAS_POR_QR = {
    OR: [
      { instanceType: null },
      { instanceType: { equals: 'Whatsapp', mode: 'insensitive' as const } },
      { instanceType: { equals: 'waha', mode: 'insensitive' as const } },
    ],
  }

  const users = await db.user.findMany({
    where: {
      notificationNumber: { not: '0000000000' },
      instancias: { some: LINEAS_POR_QR },
    },
    select: {
      id: true,
      name: true,
      notificationNumber: true,
      apiKey: { select: { url: true, key: true } },
      instancias: {
        where: LINEAS_POR_QR,
        select: {
          instanceName: true,
          instanceType: true,
        },
      },
    },
  })

  const result = {
    success: true,
    scanned: 0,
    disconnected: 0,
    notified: 0,
    skipped: 0,
    failed: 0,
    failures: [] as Array<{ userId: string; instanceName: string; message: string }>,
  }

  for (const user of users) {
    const serverUrl = normalizeBaseUrl(user.apiKey?.url)
    const apiKey = user.apiKey?.key?.trim()
    const remoteJid = user.notificationNumber?.trim()

    // Sin numero al que avisar no hay nada que hacer. La clave de Evolution ya
    // NO es requisito de la cuenta: solo la necesitan sus lineas de Evolution.
    if (!remoteJid || remoteJid === '0000000000') {
      result.skipped += user.instancias.length
      continue
    }

    // Las credenciales se resuelven UNA vez por cuenta, no una por linea.
    const credEvolution = serverUrl && apiKey ? { base: serverUrl, key: apiKey } : null

    for (const instance of user.instancias) {
      if (!instance.instanceName) {
        result.skipped += 1
        continue
      }

      const proveedor = proveedorDeLaFila(instance.instanceType)
      if (proveedor === 'otro') {
        result.skipped += 1
        continue
      }
      if (proveedor === 'evolution' && !credEvolution) {
        result.skipped += 1
        continue
      }

      result.scanned += 1

      const estado = await estadoDeLaSesionDeLaLinea(
        {
          instanceName: instance.instanceName,
          instanceType: instance.instanceType,
          userId: user.id,
        },
        credEvolution,
      )

      // `desconocido` NO es «caída»: es que no se pudo preguntar. Avisar por eso
      // seria mandarle un WhatsApp al cliente cada vez que el servidor tarde.
      if (estado === 'desconocido') {
        result.failed += 1
        result.failures.push({
          userId: user.id,
          instanceName: instance.instanceName,
          message: `No se pudo consultar el estado (${proveedor}).`,
        })
        continue
      }

      const cacheKey = `cron:evolution-disconnect:${user.id}:${instance.instanceName}`
      const entry =
        cache.get(cacheKey) ?? {
          lastIsConnected: null,
          lastNotifiedAt: 0,
          notifiedDayKey: todayKey,
          notifiedCountToday: 0,
          notifiedSlotsToday: [],
        }

      const dayChanged = entry.notifiedDayKey !== todayKey
      if (dayChanged) {
        entry.notifiedDayKey = todayKey
        entry.notifiedCountToday = 0
        entry.notifiedSlotsToday = []
      }

      if (estado === 'conectada') {
        entry.lastIsConnected = true
        cache.set(cacheKey, entry)
        continue
      }

      result.disconnected += 1

      const cooldownOk = now - entry.lastNotifiedAt >= DISCONNECT_COOLDOWN_MS
      const slotKey = String(currentHour)
      const notifiedSlotsToday = entry.notifiedSlotsToday ?? []
      const dailyOk = entry.notifiedCountToday < NOTIFICATION_HOURS.length
      const slotOk = !notifiedSlotsToday.includes(slotKey)
      const shouldNotify = cooldownOk && dailyOk && slotOk

      if (!shouldNotify) {
        result.skipped += 1
        entry.lastIsConnected = false
        cache.set(cacheKey, entry)
        continue
      }

      try {
        await sendQrDisconnectedNotification(remoteJid, user.id, 'evolution-disconnect-cron')
        result.notified += 1
        entry.lastNotifiedAt = now
        entry.notifiedCountToday += 1
        entry.notifiedSlotsToday = [...notifiedSlotsToday, slotKey]
      } catch (error) {
        result.failed += 1
        result.failures.push({
          userId: user.id,
          instanceName: instance.instanceName,
          message: error instanceof Error ? error.message : String(error),
        })
      }

      entry.lastIsConnected = false
      cache.set(cacheKey, entry)
    }
  }

  return result
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, message: 'CRON_SECRET no esta configurado.' },
      { status: 500 },
    )
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: 'No autorizado.' }, { status: 401 })
  }

  const result = await runEvolutionDisconnectScan()
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}

export async function GET(request: Request) {
  return POST(request)
}
