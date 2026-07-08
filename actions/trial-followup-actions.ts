'use server'

import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { isAdmin } from '@/lib/rbac'
import { resolveWhatsAppDispatcherLine, sendViaWhatsAppDispatcher } from '@/actions/whatsapp-dispatcher'

export interface TrialFollowUpConfigData {
  enabled: boolean
  enabled1: boolean
  enabled3: boolean
  enabled6: boolean
  instanceName: string
  message1: string
  message3: string
  message6: string
}

// La URL de Evolution puede estar guardada sin protocolo (ej. "evoapi.ia-app.com").
// fetch() exige URL absoluta, así que anteponemos https:// si falta.
function normalizeBaseUrl(url: string | null | undefined): string {
  const trimmed = (url ?? '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const DEFAULT_MESSAGES = {
  message1: `👋 *¡Hola {nombre}!* Ya tienes acceso a tu *prueba gratis*. 🚀

El *Copiloto IA* te guía paso a paso y te ayuda a *generar automáticamente las instrucciones y flujos* para tu Agente IA. 🤖

❓ ¿Tienes alguna *pregunta para empezar?*`,
  message3: `👋 *¡Hola {nombre}!*

Han pasado 3 días desde que activaste tu *prueba gratis*. 🚀

¿Cómo va tu experiencia? ¿Has podido *configurar tu Agente IA* y *sus funcionabilidades?* 🤖

Si necesitas ayuda, estamos para apoyarte. ✅`,
  message6: `⏰ *¡Hola {nombre}!*

Tu *prueba gratis* finaliza mañana. 🚀

🤖 ¿Te gustaría seguir disfrutando de tu *Agente IA* y todas sus funcionalidades?

💬 Escríbenos para ayudarte a elegir el plan ideal.`,
}

const DEFAULT_TRIAL_FOLLOWUP_INSTANCE =
  process.env.TRIAL_FOLLOWUP_WHATSAPP_INSTANCE ||
  process.env.NOTIFICATIONS_WHATSAPP_INSTANCE ||
  'VERZAY_NOTIFICACIONES_wh'

export async function getTrialFollowUpConfig(resellerId?: string) {
  const user = await currentUser()
  if (!user) return { success: false, data: null }

  const targetId = resellerId && isAdmin(user.role) ? resellerId : user.id

  const config = await db.trialFollowUpConfig.findUnique({
    where: { resellerId: targetId },
  })

  return {
    success: true,
    data: config ?? {
      enabled: true,
      enabled1: true,
      enabled3: true,
      enabled6: true,
      instanceName: '',
      message1: DEFAULT_MESSAGES.message1,
      message3: DEFAULT_MESSAGES.message3,
      message6: DEFAULT_MESSAGES.message6,
    },
  }
}

export async function saveTrialFollowUpConfig(data: TrialFollowUpConfigData, resellerId?: string) {
  const user = await currentUser()
  if (!user) return { success: false, message: 'No autenticado' }

  const targetId = resellerId && isAdmin(user.role) ? resellerId : user.id

  const payload = {
    enabled: data.enabled,
    enabled1: data.enabled1,
    enabled3: data.enabled3,
    enabled6: data.enabled6,
    instanceName: data.instanceName || null,
    message1: data.message1 || null,
    message3: data.message3 || null,
    message6: data.message6 || null,
  }

  await db.trialFollowUpConfig.upsert({
    where: { resellerId: targetId },
    update: payload,
    create: { resellerId: targetId, ...payload },
  })

  return { success: true, message: 'Configuración guardada' }
}

export async function getDefaultMessages() {
  return DEFAULT_MESSAGES
}

/**
 * Lista las instancias Evolution disponibles para el usuario actual,
 * usando sus credenciales (apiKey) guardadas. Sirve para el selector de
 * instancia en lugar de escribir el nombre a mano.
 */
export async function getAvailableInstances(): Promise<{
  success: boolean
  message: string
  data: { name: string; status: string }[]
}> {
  const user = await currentUser()
  if (!user) return { success: false, message: 'No autenticado', data: [] }

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { apiKey: { select: { url: true, key: true } } },
  })

  if (!dbUser?.apiKey?.url || !dbUser.apiKey.key) {
    return { success: false, message: 'No tienes credenciales Evolution configuradas.', data: [] }
  }

  const baseUrl = normalizeBaseUrl(dbUser.apiKey.url)

  try {
    const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: { apikey: dbUser.apiKey.key, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return { success: false, message: `Evolution respondió ${res.status}`, data: [] }
    }
    const raw = await res.json()
    const list = Array.isArray(raw) ? raw : []
    let data = list
      .map((i: any) => ({
        name: i?.name ?? i?.instance?.instanceName ?? '',
        status: i?.connectionStatus ?? i?.instance?.status ?? 'unknown',
      }))
      .filter((i: { name: string }) => !!i.name)

    let ownerIds: Set<string> | null = null

    // Evolution devuelve TODAS las instancias del servidor. Los admins ven
    // todas; un reseller solo debe ver SUS instancias (su cuenta principal +
    // las de sus clientes), no las de toda la plataforma.
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      const [demoClients, assignments] = await Promise.all([
        db.user.findMany({ where: { demoResellerId: user.id }, select: { id: true } }),
        db.reseller.findMany({ where: { resellerid: user.id }, select: { userId: true } }),
      ])
      ownerIds = new Set<string>([user.id])
      demoClients.forEach((c) => ownerIds.add(c.id))
      assignments.forEach((a) => { if (a.userId) ownerIds.add(a.userId) })

      const myInstancias = await db.instancia.findMany({
        where: { userId: { in: Array.from(ownerIds) } },
        select: { instanceName: true },
      })
      const allowed = new Set(myInstancias.map((i) => i.instanceName))
      data = data.filter((i: { name: string }) => allowed.has(i.name))
    }

    const metaInstances = await db.instancia.findMany({
      where: {
        ...(ownerIds ? { userId: { in: Array.from(ownerIds) } } : {}),
        instanceType: { equals: 'Meta', mode: 'insensitive' },
        OR: [
          { metaChannel: null },
          { metaChannel: { equals: 'whatsapp', mode: 'insensitive' } },
        ],
      },
      select: {
        instanceName: true,
        metaAccessToken: true,
        metaPhoneNumberId: true,
      },
    })

    const existingNames = new Set(data.map((item) => item.name))
    for (const instance of metaInstances) {
      const name = instance.instanceName?.trim()
      if (!name || existingNames.has(name)) continue
      existingNames.add(name)
      data.push({
        name,
        status: instance.metaAccessToken && instance.metaPhoneNumberId ? 'open' : 'unknown',
      })
    }

    return { success: true, message: 'Instancias obtenidas', data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Error consultando Evolution: ${message}`, data: [] }
  }
}

/**
 * Envía un mensaje de prueba al número de notificación del usuario actual,
 * para que pueda ver cómo llega el seguimiento por WhatsApp antes de activarlo.
 */
export async function sendTrialTestMessage(
  message: string,
  instanceName: string,
): Promise<{ success: boolean; message: string }> {
  const user = await currentUser()
  if (!user) return { success: false, message: 'No autenticado' }

  const text = (message || '').trim()
  if (!text) return { success: false, message: 'El mensaje esta vacio.' }

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { notificationNumber: true },
  })

  const phone = dbUser?.notificationNumber
  if (!phone || phone === '0000000000') {
    return { success: false, message: 'No tienes un numero de notificacion configurado.' }
  }

  const preview = text.replace(/\{nombre\}/gi, user.name?.split(' ')[0] || 'amigo')
  const preferredInstanceName = (instanceName || DEFAULT_TRIAL_FOLLOWUP_INSTANCE).trim()
  const dispatcher = await resolveWhatsAppDispatcherLine({
    ownerUserId: instanceName ? user.id : null,
    preferredInstanceName,
    includeAdminFallback: true,
  })

  if (!dispatcher) {
    return { success: false, message: 'No se encontro una linea de WhatsApp conectada para enviar la prueba.' }
  }

  try {
    const result = await sendViaWhatsAppDispatcher({
      dispatcher,
      remoteJid: phone,
      text: preview,
      history: {
        instanceName: dispatcher.instanceName,
        type: 'notification',
        additionalKwargs: { kind: 'trial-followup-test' },
      },
    })
    if (!result.success) {
      return { success: false, message: result.message }
    }
    return { success: true, message: `Mensaje de prueba enviado a ${phone} por ${dispatcher.instanceName}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Error al enviar: ${message}` }
  }
}
