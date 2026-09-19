'use server'

import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { esAdminDeVerdad } from '@/lib/super-admin-de-verdad'
import { proveedorDeLaFila } from '@/lib/sesion-de-la-linea'
import { getWahaSession } from '@/lib/waha'
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
 * Las lineas entre las que se puede elegir: **de NUESTRA tabla `Instancias`**.
 *
 * # Por que no se le pregunta a Evolution
 *
 * Antes esto llamaba a `fetchInstances` con la `ApiKey` de quien mirara, asi
 * que la lista era «lo que devuelva ESE servidor Evolution». Con el rol de
 * superadministrador viviendo en una fila distinta —otra `apiKey`, otro
 * servidor— el desplegable paso de ~30 lineas a **7**, y la linea elegida para
 * el aviso (`VERZAY_NOTIFICACIONES`) salia con punto gris y sin aparecer en la
 * lista: no es que estuviera desconectada, es que esa consulta no sabia nada de
 * ella. Y la prueba de envio rebotaba con «No tienes acceso a la instancia X»,
 * porque validaba contra esa misma lista corta.
 *
 * Es la regla que ya rige en «Actividad de instancias»: **el universo sale de
 * `Instancias`, nunca del proveedor.** Una linea que no conteste sigue estando
 * en la tabla, y tiene que poder elegirse; el estado es un adorno, no el censo.
 *
 * # El estado se cruza APARTE, y no puede quitar filas
 *
 * La conexion sigue viniendo de Evolution, pero se pide a **los servidores de
 * los dueños de esas lineas**, una vez por servidor distinto y en paralelo. Si
 * uno no contesta, sus lineas salen igual con `unknown`: el punto queda gris y
 * la linea se puede seguir eligiendo. Perder el color es un detalle; perder la
 * linea era el fallo.
 */
export async function getAvailableInstances(): Promise<{
  success: boolean
  message: string
  data: { name: string; status: string }[]
}> {
  const user = await currentUser()
  if (!user) return { success: false, message: 'No autenticado', data: [] }

  try {
    // Quien manda en la plataforma las ve todas; un reseller, solo las suyas.
    // Se pregunta por la PERSONA: con el conmutador de cuentas, `user.role` es
    // el de la cuenta en la que se esta metido, no el de quien mira.
    const mandaEnTodo = esAdminDeVerdad(user)

    let ownerIds: string[] | null = null
    if (!mandaEnTodo) {
      const [demoClients, assignments] = await Promise.all([
        db.user.findMany({ where: { demoResellerId: user.id }, select: { id: true } }),
        db.reseller.findMany({ where: { resellerid: user.id }, select: { userId: true } }),
      ])
      const mios = new Set<string>([user.id])
      demoClients.forEach((c) => mios.add(c.id))
      assignments.forEach((a) => { if (a.userId) mios.add(a.userId) })
      ownerIds = Array.from(mios)
    }

    const lineas = await db.instancia.findMany({
      where: ownerIds ? { userId: { in: ownerIds } } : {},
      select: {
        instanceName: true,
        instanceType: true,
        metaAccessToken: true,
        metaPhoneNumberId: true,
        user: { select: { apiKey: { select: { url: true, key: true } } } },
      },
    })

    // Un servidor por cada par (url, key) distinto, no uno por linea: con 30
    // lineas de la misma cuenta eso serian 30 consultas identicas.
    const servidores = new Map<string, { url: string; key: string }>()
    for (const l of lineas) {
      const cred = l.user?.apiKey
      if (!cred?.url || !cred.key) continue
      servidores.set(`${cred.url}::${cred.key}`, { url: cred.url, key: cred.key })
    }

    const estados = new Map<string, string>()
    await Promise.allSettled(
      Array.from(servidores.values()).map(async (cred) => {
        const base = normalizeBaseUrl(cred.url)
        if (!base) return
        const res = await fetch(`${base}/instance/fetchInstances`, {
          method: 'GET',
          headers: { apikey: cred.key, Accept: 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) throw new Error(`Evolution respondio ${res.status}`)
        const raw = await res.json().catch(() => null)
        for (const i of Array.isArray(raw) ? raw : []) {
          const nombre = (i?.name ?? i?.instance?.instanceName ?? '').trim()
          if (!nombre) continue
          estados.set(nombre, i?.connectionStatus ?? i?.instance?.status ?? 'unknown')
        }
      }),
    )

    // Y las de WhatsApp Mensajeria, que no salen en `fetchInstances` de
    // Evolution: son de otro servidor. Sin esta vuelta, TODAS las lineas de Waha
    // salian con el punto gris y `unknown` — o sea, el aviso de mas abajo
    // («lineas sin estado de conexion») se disparaba por diseño en cualquier
    // plataforma con Waha, que es tanto como no tenerlo.
    const lineasWaha = lineas.filter(
      (l) => l.instanceName && proveedorDeLaFila(l.instanceType) === 'waha',
    )
    if (lineasWaha.length > 0) {
      await Promise.allSettled(
        lineasWaha.map(async (l) => {
          const sesion = await getWahaSession(l.instanceName as string)
          if (sesion) estados.set(l.instanceName as string, sesion.status === 'WORKING' ? 'open' : 'close')
        }),
      )
    }

    const data: { name: string; status: string }[] = []
    const vistos = new Set<string>()
    for (const l of lineas) {
      const name = l.instanceName?.trim()
      if (!name || vistos.has(name)) continue
      vistos.add(name)

      // Los canales de Meta no pasan por Evolution: su «conectada» es tener las
      // credenciales puestas, que es lo que ya hacia esto antes.
      const esMeta = (l.instanceType ?? '').toLowerCase() === 'meta'
      const status = esMeta
        ? l.metaAccessToken && l.metaPhoneNumberId ? 'open' : 'unknown'
        : estados.get(name) ?? 'unknown'

      data.push({ name, status })
    }

    data.sort((a, b) => a.name.localeCompare(b.name))

    // Cuantas se quedaron sin estado: si son todas, Evolution no contesto y
    // conviene saberlo antes de concluir que «no hay ninguna conectada».
    const sinEstado = data.filter((d) => d.status === 'unknown').length
    if (sinEstado > 0) {
      console.info('[instancias] lineas sin estado de conexion', {
        sinEstado,
        total: data.length,
        servidores: servidores.size,
      })
    }

    return { success: true, message: 'Instancias obtenidas', data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[instancias] no se pudieron listar las lineas', { message })
    return { success: false, message: `Error listando instancias: ${message}`, data: [] }
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
    if (dispatcher.provider !== 'meta' && !messageId) {
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
