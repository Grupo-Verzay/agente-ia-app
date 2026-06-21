import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

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

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
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

  // Usuarios con trial activo
  const trialUsers = await db.user.findMany({
    where: { trialEndsAt: { not: null, gt: now } },
    select: {
      id: true,
      name: true,
      notificationNumber: true,
      createdAt: true,
      demoResellerId: true,
      apiKey: { select: { url: true, key: true } },
    },
  })

  const results = { sent: 0, skipped: 0, failed: 0 }

  for (const user of trialUsers) {
    const days = daysSince(user.createdAt)
    const targetDay = FOLLOW_UP_DAYS.find(d => d === days)
    if (!targetDay) continue

    // Ya enviado?
    const already = await db.trialFollowUpLog.findUnique({
      where: { userId_day: { userId: user.id, day: targetDay } },
    })
    if (already) { results.skipped++; continue }

    // Config del reseller
    const config = user.demoResellerId
      ? await db.trialFollowUpConfig.findUnique({ where: { resellerId: user.demoResellerId } })
      : null

    if (config && !config.enabled) { results.skipped++; continue }

    // Credenciales Evolution
    let instanceName = config?.instanceName || fallbackInstanceName
    let apiUrl = fallbackApiUrl
    let apiKey = fallbackApiKey

    // Si el reseller tiene su propia instancia configurada, usar sus credenciales
    if (config?.instanceName && user.demoResellerId) {
      const resellerUser = await db.user.findUnique({
        where: { id: user.demoResellerId },
        select: { apiKey: { select: { url: true, key: true } } },
      })
      if (resellerUser?.apiKey) {
        apiUrl = resellerUser.apiKey.url
        apiKey = resellerUser.apiKey.key
      }
    }

    if (!instanceName || !apiUrl || !apiKey) {
      await db.trialFollowUpLog.create({
        data: { userId: user.id, day: targetDay, status: 'FAILED', error: 'Sin credenciales Evolution configuradas' },
      })
      results.failed++
      continue
    }

    const messageKey = `message${targetDay}` as 'message1' | 'message3' | 'message6'
    const text = resolveMessage(config?.[messageKey], DEFAULT_MESSAGES[targetDay], user.name ?? '')
    const sendUrl = `${apiUrl}/message/sendText/${instanceName}`

    try {
      await sendWhatsApp(sendUrl, apiKey, user.notificationNumber, text)
      await db.trialFollowUpLog.create({
        data: { userId: user.id, day: targetDay, status: 'SENT' },
      })
      results.sent++
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await db.trialFollowUpLog.create({
        data: { userId: user.id, day: targetDay, status: 'FAILED', error },
      })
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
