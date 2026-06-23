import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { ADMIN_USER_ID } from '@/types/generic'

const CRON_HEADER = 'x-cron-secret'

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRON_SECRET ?? '').trim()
  if (!expected) return false
  const bearer = request.headers.get('authorization')
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : ''
  return (token || (request.headers.get(CRON_HEADER) ?? '').trim()) === expected
}

const DEFAULT_MESSAGES: Record<number, string> = {
  1: '¡Hola {nombre}! 👋 Ya tienes acceso a tu prueba gratis. ¿Tienes alguna pregunta para empezar?',
  3: '¡Hola {nombre}! ¿Cómo va tu experiencia? Si necesitas ayuda para configurar algo, estamos aquí. 🚀',
  6: '¡Hola {nombre}! Tu prueba gratis termina mañana. ¿Quieres continuar con todos estos beneficios? Escríbenos para elegir tu plan. 💬',
}

const FOLLOW_UP_DAYS = [1, 3, 6]
const MAX_ATTEMPTS = 3

// Ventana horaria local del cliente en la que es aceptable enviar (evita madrugadas).
// Para que esto funcione el cron debe correr cada hora; la unicidad por (userId, day)
// garantiza que solo se envíe una vez aunque corra varias veces al día.
const SEND_AFTER_HOUR = 9 // no enviar antes de las 9:00 local
const SEND_BEFORE_HOUR = 21 // no enviar a partir de las 21:00 local
const DEFAULT_TIMEZONE = 'America/Bogota'

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

// La URL de Evolution puede estar guardada sin protocolo (ej. "evoapi.ia-app.com").
// fetch() exige URL absoluta, así que anteponemos https:// si falta.
function normalizeBaseUrl(url: string | null | undefined): string {
  const trimmed = (url ?? '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

// Hora local (0-23) del usuario según su zona horaria.
function localHour(now: Date, timezone: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: timezone || DEFAULT_TIMEZONE,
    }).formatToParts(now)
    const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
    return h === 24 ? 0 : h
  } catch {
    // Zona horaria inválida → usar la zona por defecto de la plataforma.
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: DEFAULT_TIMEZONE,
    }).formatToParts(now)
    const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
    return h === 24 ? 0 : h
  }
}

function resolveMessage(template: string | null | undefined, fallback: string, name: string): string {
  return (template || fallback).replace(/\{nombre\}/gi, name || 'amigo')
}

async function sendWhatsApp(url: string, apikey: string, phone: string, text: string) {
  const remoteJid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey },
    body: JSON.stringify({ number: remoteJid, delay: 1200, text }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`)
}

async function runTrialFollowUps() {
  const now = new Date()

  // Instancia fallback de la plataforma (Verzay central)
  const fallbackInstanceName = process.env.FOLLOWUP_INSTANCE_NAME ?? ''
  const fallbackApiUrl = process.env.FOLLOWUP_API_URL ?? ''
  const fallbackApiKey = process.env.FOLLOWUP_API_KEY ?? ''

  // Usuarios con trial activo que aún NO han contratado un plan pagado.
  // Si ya tienen una suscripción ACTIVE convirtieron, así que dejan de recibir seguimientos.
  const trialUsers = await db.user.findMany({
    where: {
      trialEndsAt: { not: null, gt: now },
      userSubscriptions: { none: { status: 'ACTIVE' } },
    },
    select: {
      id: true,
      name: true,
      notificationNumber: true,
      createdAt: true,
      demoResellerId: true,
      timezone: true,
    },
  })

  const results = { sent: 0, skipped: 0, failed: 0, deferred: 0 }
  if (trialUsers.length === 0) return results

  // Carga en lote para evitar N+1: configs por reseller + config central (admin) y logs.
  const resellerIds = Array.from(new Set(trialUsers.map(u => u.demoResellerId).filter((id): id is string => !!id)))
  const [configs, adminConfig, logs] = await Promise.all([
    db.trialFollowUpConfig.findMany({ where: { resellerId: { in: resellerIds } } }),
    db.trialFollowUpConfig.findUnique({ where: { resellerId: ADMIN_USER_ID } }),
    db.trialFollowUpLog.findMany({ where: { userId: { in: trialUsers.map(u => u.id) } } }),
  ])
  const configByReseller = new Map(configs.map(c => [c.resellerId, c]))
  const logsByUser = new Map<string, typeof logs>()
  for (const log of logs) {
    const arr = logsByUser.get(log.userId) ?? []
    arr.push(log)
    logsByUser.set(log.userId, arr)
  }

  // Resolver el servidor Evolution (url + key) de cada instancia seleccionada de
  // forma dinámica: instancia -> usuario dueño -> su apiKey (servidor evoapiN).
  // Así la URL sale de la instancia elegida en el panel, no de un env fijo.
  const neededInstances = Array.from(new Set(
    [adminConfig?.instanceName, ...configs.map(c => c.instanceName)]
      .filter((n): n is string => !!n && n.trim() !== ''),
  ))
  const instanceCredByName = new Map<string, { url: string; key: string }>()
  if (neededInstances.length > 0) {
    const instRows = await db.instancia.findMany({
      where: { instanceName: { in: neededInstances } },
      select: { instanceName: true, userId: true },
    })
    const ownerIds = Array.from(new Set(instRows.map(r => r.userId)))
    const owners = await db.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, apiKey: { select: { url: true, key: true } } },
    })
    const apiKeyByUser = new Map(owners.map(o => [o.id, o.apiKey]))
    for (const row of instRows) {
      const ak = apiKeyByUser.get(row.userId)
      if (ak?.url && ak.key && !instanceCredByName.has(row.instanceName)) {
        instanceCredByName.set(row.instanceName, { url: ak.url, key: ak.key })
      }
    }
  }

  for (const user of trialUsers) {
    const days = daysSince(user.createdAt)
    const userLogs = logsByUser.get(user.id) ?? []
    const logByDay = new Map(userLogs.map(l => [l.day, l]))

    // Día objetivo: el seguimiento más antiguo que YA tocaba (día <= days),
    // que no se haya enviado con éxito y que no haya agotado los reintentos.
    // Esto recupera envíos perdidos si el cron no corrió un día concreto (fix catch-up),
    // y reintenta los FAILED hasta MAX_ATTEMPTS (fix reintentos).
    const targetDay = FOLLOW_UP_DAYS.find(d => {
      if (d > days) return false
      const log = logByDay.get(d)
      if (!log) return true
      if (log.status === 'SENT') return false
      return log.attempts < MAX_ATTEMPTS
    })
    if (targetDay === undefined) continue

    // Respeta la zona horaria del cliente: si es de madrugada/noche, no se envía
    // ahora; se difiere a la siguiente corrida horaria que caiga dentro de la ventana.
    const hour = localHour(now, user.timezone)
    if (hour < SEND_AFTER_HOUR || hour >= SEND_BEFORE_HOUR) {
      results.deferred++
      continue
    }

    // Config aplicable: la del reseller del usuario; si no tiene, la central (admin).
    const config =
      (user.demoResellerId ? configByReseller.get(user.demoResellerId) : null) ?? adminConfig ?? null

    // Apagado global o apagado específico para este día.
    const dayEnabledKey = `enabled${targetDay}` as 'enabled1' | 'enabled3' | 'enabled6'
    if (config && (!config.enabled || !config[dayEnabledKey])) { results.skipped++; continue }

    const recordLog = (status: 'SENT' | 'FAILED', error?: string) =>
      db.trialFollowUpLog.upsert({
        where: { userId_day: { userId: user.id, day: targetDay } },
        create: { userId: user.id, day: targetDay, status, error: error ?? null, attempts: 1, sentAt: now },
        update: { status, error: error ?? null, attempts: { increment: 1 }, sentAt: now },
      })

    // Credenciales Evolution. Si hay instancia seleccionada, su servidor se
    // resuelve dinámicamente desde la instancia (mismo criterio que el botón
    // "Probar a mi número"). Si no hay instancia, se usa el número central de
    // respaldo (FOLLOWUP_* env).
    const selectedInstance = (config?.instanceName ?? '').trim()
    let instanceName = selectedInstance || fallbackInstanceName
    let apiUrl = fallbackApiUrl
    let apiKey = fallbackApiKey
    if (selectedInstance) {
      const creds = instanceCredByName.get(selectedInstance)
      if (!creds) {
        await recordLog('FAILED', `Instancia "${selectedInstance}" sin servidor/credenciales`)
        results.failed++
        continue
      }
      apiUrl = creds.url
      apiKey = creds.key
    }

    if (!instanceName || !apiUrl || !apiKey) {
      await recordLog('FAILED', 'Sin credenciales Evolution configuradas')
      results.failed++
      continue
    }

    const messageKey = `message${targetDay}` as 'message1' | 'message3' | 'message6'
    const text = resolveMessage(config?.[messageKey], DEFAULT_MESSAGES[targetDay], user.name ?? '')
    const sendUrl = `${normalizeBaseUrl(apiUrl)}/message/sendText/${instanceName}`

    try {
      await sendWhatsApp(sendUrl, apiKey, user.notificationNumber, text)
      await recordLog('SENT')
      results.sent++
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await recordLog('FAILED', error)
      results.failed++
    }
  }

  return results
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, message: 'CRON_SECRET no configurado.' }, { status: 500 })
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: 'No autorizado.' }, { status: 401 })
  }

  try {
    const results = await runTrialFollowUps()
    return NextResponse.json({ success: true, ...results })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, message: error }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return POST(request)
}
