import { sendQrDisconnectedNotification } from '@/actions/api-action'
import { db } from '@/lib/db'
import {
  DISCONNECT_COOLDOWN_MS,
  EVO_FETCH_TIMEOUT_MS,
  getDayKeyBogota,
  getEvoCache,
  isWhatsappLike,
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

function isDisconnectedState(state: string | null): boolean {
  return state !== 'open'
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

async function getEvolutionState(args: {
  serverUrl: string
  apiKey: string
  instanceName: string
}): Promise<{ ok: boolean; state: string | null; message?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EVO_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${args.serverUrl}/instance/connectionState/${encodeURIComponent(args.instanceName)}`,
      {
        method: 'GET',
        headers: { apikey: args.apiKey },
        cache: 'no-store',
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      return { ok: false, state: null, message: `HTTP ${response.status}` }
    }

    const data = await response.json().catch(() => null)
    const state = data?.instance?.state ?? data?.state ?? data?.connectionState ?? null

    return {
      ok: true,
      state: state == null ? null : String(state).trim().toLowerCase(),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, state: null, message }
  } finally {
    clearTimeout(timeout)
  }
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

  const users = await db.user.findMany({
    where: {
      notificationNumber: { not: '0000000000' },
      apiKey: { isNot: null },
      instancias: {
        some: {
          OR: [
            { instanceType: null },
            { instanceType: { equals: 'Whatsapp', mode: 'insensitive' } },
          ],
        },
      },
    },
    select: {
      id: true,
      name: true,
      notificationNumber: true,
      apiKey: { select: { url: true, key: true } },
      instancias: {
        where: {
          OR: [
            { instanceType: null },
            { instanceType: { equals: 'Whatsapp', mode: 'insensitive' } },
          ],
        },
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

    if (!serverUrl || !apiKey || !remoteJid || remoteJid === '0000000000') {
      result.skipped += user.instancias.length
      continue
    }

    for (const instance of user.instancias) {
      if (!instance.instanceName || !isWhatsappLike(instance.instanceType)) {
        result.skipped += 1
        continue
      }

      result.scanned += 1

      const state = await getEvolutionState({
        serverUrl,
        apiKey,
        instanceName: instance.instanceName,
      })

      if (!state.ok) {
        result.failed += 1
        result.failures.push({
          userId: user.id,
          instanceName: instance.instanceName,
          message: state.message ?? 'No se pudo consultar Evolution.',
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

      if (!isDisconnectedState(state.state)) {
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
