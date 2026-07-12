import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import {
  resolveSystemNotificationInstanceName,
  resolveWhatsAppDispatcherLine,
  sendViaWhatsAppDispatcher,
} from '@/actions/whatsapp-dispatcher'

const CRON_HEADER = 'x-cron-secret'

function isAuthorized(request: Request): boolean {
  const expected = (process.env.CRON_SECRET ?? '').trim()
  if (!expected) return false
  const bearer = request.headers.get('authorization')
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : ''
  return (token || (request.headers.get(CRON_HEADER) ?? '').trim()) === expected
}

const DEFAULT_MESSAGES: Record<number, string> = {
  1: `👋 *¡Hola {nombre}!* Ya tienes acceso a tu *prueba gratis*. 🚀

El *Copiloto IA* te guía paso a paso y te ayuda a *generar automáticamente las instrucciones y flujos* para tu Agente IA. 🤖

❓ ¿Tienes alguna *pregunta para empezar?*`,
  3: `👋 *¡Hola {nombre}!*

Han pasado 3 días desde que activaste tu *prueba gratis*. 🚀

¿Cómo va tu experiencia? ¿Has podido *configurar tu Agente IA* y *sus funcionabilidades?* 🤖

Si necesitas ayuda, estamos para apoyarte. ✅`,
  6: `⏰ *¡Hola {nombre}!*

Tu *prueba gratis* finaliza mañana. 🚀

🤖 ¿Te gustaría seguir disfrutando de tu *Agente IA* y todas sus funcionalidades?

💬 Escríbenos para ayudarte a elegir el plan ideal.`,
}

const FOLLOW_UP_DAYS = [1, 3, 6]
const MAX_ATTEMPTS = 3
// Hora local del cliente en la que se envía el seguimiento. El cron corre cada
// hora al minuto :30, así que al exigir la hora 9 el mensaje llega ~9:30 AM
// local. Si el seguimiento vence fuera de esta hora, se difiere a la mañana
// siguiente (nunca se envía por la tarde/noche). La unicidad por (userId, day)
// garantiza que solo se envíe una vez aunque el cron corra varias veces al día.
const SEND_HOUR = 9 // enviar únicamente durante la hora 9 local (→ ~9:30 AM)
const DEFAULT_TIMEZONE = 'America/Bogota'

// Clave de fecha local (YYYY-MM-DD) según la zona horaria del usuario.
function localDateKey(date: Date, timezone: string | null | undefined): string {
  const tz = timezone || DEFAULT_TIMEZONE
  try {
    // en-CA produce el orden YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: tz,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: DEFAULT_TIMEZONE,
    }).format(date)
  }
}

// Días calendario transcurridos desde el registro, en la zona horaria del
// usuario. Usar días calendario (y no 24h corridas) hace que "día 1" sea SIEMPRE
// la mañana siguiente al registro, sin importar la hora a la que se registró.
function daysSince(createdAt: Date, now: Date, timezone: string | null | undefined): number {
  const start = new Date(`${localDateKey(createdAt, timezone)}T00:00:00Z`).getTime()
  const today = new Date(`${localDateKey(now, timezone)}T00:00:00Z`).getTime()
  return Math.round((today - start) / (1000 * 60 * 60 * 24))
}

// La URL de Evolution puede estar guardada sin protocolo (ej. "evoapi.ia-app.com").
// fetch() exige URL absoluta, así que anteponemos https:// si falta.
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

async function runTrialFollowUps() {
  const now = new Date()

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

  const superAdmins = await db.user.findMany({
    where: { role: 'super_admin' },
    select: { id: true, name: true, company: true },
  })
  const superAdminIds = superAdmins
    .sort((a, b) => {
      const aLabel = `${a.company ?? ''} ${a.name ?? ''}`.toLowerCase()
      const bLabel = `${b.company ?? ''} ${b.name ?? ''}`.toLowerCase()
      const aIsGrupo = aLabel.includes('grupo')
      const bIsGrupo = bLabel.includes('grupo')
      if (aIsGrupo !== bIsGrupo) return aIsGrupo ? -1 : 1
      return aLabel.localeCompare(bLabel)
    })
    .map((admin) => admin.id)

  // Carga en lote para evitar N+1: configs por reseller + config central de Verzay y logs.
  const resellerIds = Array.from(new Set(trialUsers.map(u => u.demoResellerId).filter((id): id is string => !!id)))
  const [configs, adminConfig, logs] = await Promise.all([
    db.trialFollowUpConfig.findMany({ where: { resellerId: { in: resellerIds } } }),
    superAdminIds.length
      ? db.trialFollowUpConfig.findFirst({ where: { resellerId: { in: superAdminIds } } })
      : Promise.resolve(null),
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
  for (const user of trialUsers) {
    const days = daysSince(user.createdAt, now, user.timezone)
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

    // Respeta la zona horaria del cliente: solo se envía durante la hora 9 local
    // (el cron corre a :30 → llega ~9:30 AM). Fuera de esa hora se difiere a la
    // mañana siguiente.
    const hour = localHour(now, user.timezone)
    if (hour !== SEND_HOUR) {
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
    const configuredInstance = (config?.instanceName ?? '').trim()
    const selectedInstance =
      user.demoResellerId && configuredInstance
        ? configuredInstance
        : await resolveSystemNotificationInstanceName()
    const dispatcher = await resolveWhatsAppDispatcherLine({
      ownerUserId: user.demoResellerId && configuredInstance ? user.demoResellerId : null,
      preferredInstanceName: selectedInstance,
      includeAdminFallback: true,
    })

    if (!dispatcher) {
      await recordLog('FAILED', 'Sin linea de WhatsApp conectada para enviar el seguimiento')
      results.failed++
      continue
    }

    const messageKey = `message${targetDay}` as 'message1' | 'message3' | 'message6'
    const text = resolveMessage(config?.[messageKey], DEFAULT_MESSAGES[targetDay], user.name ?? '')

    try {
      const sendResult = await sendViaWhatsAppDispatcher({
        dispatcher,
        remoteJid: user.notificationNumber,
        text,
        history: {
          instanceName: dispatcher.instanceName,
          type: 'notification',
          additionalKwargs: {
            kind: 'trial-followup',
            userId: user.id,
            day: targetDay,
          },
        },
      })
      if (!sendResult.success) throw new Error(sendResult.message)
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
