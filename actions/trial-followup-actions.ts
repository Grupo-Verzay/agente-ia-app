'use server'

import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { isAdmin } from '@/lib/rbac'
import {
  resolveSystemNotificationInstanceName,
  resolveWhatsAppDispatcherLine,
  resolveWhatsAppDispatcherLineByInstanceName,
  sendViaWhatsAppDispatcher,
} from '@/actions/whatsapp-dispatcher'
import {
  DEFAULT_FOLLOW_UP_DAYS,
  MAX_TRIAL_DAYS,
  resolveTrialDays,
  validarDiasDeSeguimiento,
} from '@/lib/trial-defaults'

export interface TrialFollowUpConfigData {
  enabled: boolean
  enabled1: boolean
  enabled3: boolean
  enabled6: boolean
  instanceName: string
  message1: string
  message3: string
  message6: string
  /** Duración de la prueba gratis de esta marca. */
  trialDays: number
  /** Día en que sale cada uno de los tres seguimientos. */
  dayOffset1: number
  dayOffset2: number
  dayOffset3: number
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

export async function getTrialFollowUpConfig(resellerId?: string) {
  const user = await currentUser()
  if (!user) return { success: false, data: null }

  const targetId = resellerId && isAdmin(user.role) ? resellerId : user.id

  const config = await db.trialFollowUpConfig.findUnique({
    where: { resellerId: targetId },
  })

  // Cada valor se lee tal cual está guardado, uno por seguimiento. Ordenarlos
  // aquí (como hace el cron) desharía la correspondencia con su texto.
  return {
    success: true,
    data: {
      enabled: config?.enabled ?? true,
      enabled1: config?.enabled1 ?? true,
      enabled3: config?.enabled3 ?? true,
      enabled6: config?.enabled6 ?? true,
      instanceName: config?.instanceName ?? '',
      message1: config?.message1 ?? DEFAULT_MESSAGES.message1,
      message3: config?.message3 ?? DEFAULT_MESSAGES.message3,
      message6: config?.message6 ?? DEFAULT_MESSAGES.message6,
      trialDays: resolveTrialDays(config),
      dayOffset1: config?.dayOffset1 ?? DEFAULT_FOLLOW_UP_DAYS[0],
      dayOffset2: config?.dayOffset2 ?? DEFAULT_FOLLOW_UP_DAYS[1],
      dayOffset3: config?.dayOffset3 ?? DEFAULT_FOLLOW_UP_DAYS[2],
    },
  }
}

export async function saveTrialFollowUpConfig(data: TrialFollowUpConfigData, resellerId?: string) {
  const user = await currentUser()
  if (!user) return { success: false, message: 'No autenticado' }

  const targetId = resellerId && isAdmin(user.role) ? resellerId : user.id

  const dias = [data.dayOffset1, data.dayOffset2, data.dayOffset3].map((d) => Math.floor(Number(d)))
  const validacion = validarDiasDeSeguimiento(dias)
  if (!validacion.ok) return { success: false, message: validacion.error }

  const trialDays = Math.floor(Number(data.trialDays))
  if (!Number.isFinite(trialDays) || trialDays < 1 || trialDays > MAX_TRIAL_DAYS) {
    return { success: false, message: `La prueba debe durar entre 1 y ${MAX_TRIAL_DAYS} días.` }
  }

  // Un seguimiento posterior al fin de la prueba no sale nunca: al llegar ese
  // día la cuenta ya venció y deja de estar en la lista. Avisar aquí evita
  // dejar configurado algo que en silencio no hace nada.
  const activos = [data.enabled1, data.enabled3, data.enabled6]
  const fueraDePlazo = dias.filter((d, i) => activos[i] && d > trialDays)
  if (fueraDePlazo.length) {
    return {
      success: false,
      message: `El día ${fueraDePlazo.join(' y el ')} queda después de que venza la prueba (${trialDays} días), así que no se enviaría. Bájalo o apaga ese seguimiento.`,
    }
  }

  const payload = {
    enabled: data.enabled,
    enabled1: data.enabled1,
    enabled3: data.enabled3,
    enabled6: data.enabled6,
    instanceName: data.instanceName || null,
    message1: data.message1 || null,
    message3: data.message3 || null,
    message6: data.message6 || null,
    trialDays,
    dayOffset1: dias[0],
    dayOffset2: dias[1],
    dayOffset3: dias[2],
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
  const elegida = instanceName?.trim()

  // Cuando se elige una instancia en el desplegable, se envía POR ESA o no se
  // envía. Antes se buscaba solo entre las instancias de la cuenta actual: al
  // elegir la de otra cuenta —el desplegable las ofrece todas— no se encontraba
  // y se caía, sin decir nada, a la primera línea propia. El aviso seguía
  // diciendo "enviado", pero por una línea que nadie eligió, así que la prueba
  // medía algo distinto de lo que se estaba probando.
  let dispatcher = null as Awaited<ReturnType<typeof resolveWhatsAppDispatcherLine>>

  if (elegida) {
    // El desplegable ya limita lo que cada quien puede ver (las suyas y las de
    // sus clientes; todas si es admin). Se comprueba contra esa misma lista para
    // que nadie envíe por una línea que no le corresponde.
    const permitidas = await getAvailableInstances()
    if (!permitidas.success || !permitidas.data.some((i) => i.name === elegida)) {
      return { success: false, message: `No tienes acceso a la instancia "${elegida}".` }
    }

    dispatcher = await resolveWhatsAppDispatcherLineByInstanceName(elegida)
    if (!dispatcher) {
      return {
        success: false,
        message: `La instancia "${elegida}" no está conectada o no puede enviar WhatsApp. Elige otra.`,
      }
    }
  } else {
    dispatcher = await resolveWhatsAppDispatcherLine({
      ownerUserId: null,
      preferredInstanceName: (await resolveSystemNotificationInstanceName()).trim(),
      includeAdminFallback: true,
    })
  }

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
    // Que la línea responda 2xx NO prueba que WhatsApp aceptara el mensaje. La
    // única señal de que sí salió es el identificador que devuelve WhatsApp; sin
    // él, la línea se tragó el envío (típico de una sesión vinculada que quedó a
    // medias). Decir "enviado" en ese caso manda a buscar el fallo al lugar
    // equivocado, así que se avisa en vez de dar un OK que no está comprobado.
    const messageId = (result as { messageId?: string }).messageId
    if (dispatcher.provider !== 'baileys' && dispatcher.provider !== 'meta' && !messageId) {
      return {
        success: false,
        message: `${dispatcher.instanceName} aceptó el envío pero WhatsApp no devolvió identificador: el mensaje no salió. Revisa la conexión de esa línea o prueba con otra.`,
      }
    }
    // Se nombra el CANAL además de la instancia. Dos filas distintas pueden
    // llamarse igual —la misma línea deja una fila por cada canal por el que
    // pasó— y el nombre solo no distingue por cuál salió realmente el mensaje.
    // Cuando el aviso dice "enviado" y no llega nada, esto es lo primero que hay
    // que saber, y hasta ahora había que ir a buscarlo a la base de datos.
    return {
      success: true,
      message: `Mensaje de prueba enviado a ${phone} por ${dispatcher.instanceName} (canal: ${dispatcher.provider})`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Error al enviar: ${message}` }
  }
}
