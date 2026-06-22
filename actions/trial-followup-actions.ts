'use server'

import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { isAdmin } from '@/lib/rbac'

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

const DEFAULT_MESSAGES = {
  message1: '¡Hola {nombre}! 👋 Ya tienes acceso a tu prueba gratis. ¿Tienes alguna pregunta para empezar?',
  message3: '¡Hola {nombre}! ¿Cómo va tu experiencia? Si necesitas ayuda para configurar algo, estamos aquí. 🚀',
  message6: '¡Hola {nombre}! Tu prueba gratis termina mañana. ¿Quieres continuar con todos estos beneficios? Escríbenos para elegir tu plan. 💬',
}

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

  try {
    const res = await fetch(`${dbUser.apiKey.url}/instance/fetchInstances`, {
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
    const data = list
      .map((i: any) => ({
        name: i?.name ?? i?.instance?.instanceName ?? '',
        status: i?.connectionStatus ?? i?.instance?.status ?? 'unknown',
      }))
      .filter((i: { name: string }) => !!i.name)
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
  if (!text) return { success: false, message: 'El mensaje está vacío.' }

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { notificationNumber: true, apiKey: { select: { url: true, key: true } } },
  })

  const phone = dbUser?.notificationNumber
  if (!phone || phone === '0000000000') {
    return { success: false, message: 'No tienes un número de notificación configurado.' }
  }

  // Credenciales: instancia propia si se indicó, si no la central de la plataforma.
  let apiUrl = process.env.FOLLOWUP_API_URL ?? ''
  let apiKey = process.env.FOLLOWUP_API_KEY ?? ''
  let instance = instanceName || (process.env.FOLLOWUP_INSTANCE_NAME ?? '')

  if (instanceName && dbUser?.apiKey?.url && dbUser.apiKey.key) {
    apiUrl = dbUser.apiKey.url
    apiKey = dbUser.apiKey.key
  }

  if (!instance || !apiUrl || !apiKey) {
    return { success: false, message: 'Faltan credenciales Evolution para enviar la prueba.' }
  }

  const preview = text.replace(/\{nombre\}/gi, user.name?.split(' ')[0] || 'amigo')
  const remoteJid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`

  try {
    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: remoteJid, delay: 1200, text: preview }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      return { success: false, message: `Evolution respondió ${res.status}: ${await res.text().catch(() => '')}` }
    }
    return { success: true, message: `Mensaje de prueba enviado a ${phone}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Error al enviar: ${message}` }
  }
}
