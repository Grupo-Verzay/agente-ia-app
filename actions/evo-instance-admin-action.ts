'use server'

// Herramienta admin para eliminar instancias "huérfanas" de Evolution API:
// instancias que quedaron vivas en el servidor de Evolution pero YA NO existen en
// la base de datos ni en la app. El botón normal de la app falla con ellas porque
// exige el registro en BD; esto las borra llamando a Evolution directamente y
// devuelve el error REAL del servidor (no un "[object Object]" sin mensaje).

import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { isAdminLike } from '@/lib/rbac'

interface ForceDeleteInput {
  instanceName: string
  apiKeyId?: string // usar credenciales guardadas de este ApiKey (servidor + key)
  serverUrl?: string // o pegar servidor manualmente
  apiKey?: string //   + su API Key
}

// Normaliza la URL base de Evolution: sin protocolo repetido, sin "/manager" ni
// barras finales. Acepta "evoapi1.ia-app.com", "https://evoapi1.ia-app.com/manager", etc.
function normalizeEvoBase(raw: string): string {
  let s = (raw || '').trim()
  if (!s) return ''
  s = s.replace(/\/+$/, '') // quita barras finales
  s = s.replace(/\/manager\/?$/i, '') // quita el sufijo /manager
  s = s.replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  return s.replace(/\/+$/, '')
}

/** Lista los servidores Evolution guardados (ApiKey) para elegir en el selector. */
export async function getEvoServers(): Promise<{
  success: boolean
  data?: { id: string; url: string }[]
  message?: string
}> {
  const user = await currentUser()
  if (!user || !isAdminLike(user.role)) return { success: false, message: 'No autorizado.' }
  try {
    const keys = await db.apiKey.findMany({ select: { id: true, url: true } })
    return { success: true, data: keys.map((k) => ({ id: k.id, url: k.url })) }
  } catch {
    return { success: false, message: 'No se pudieron cargar los servidores.' }
  }
}

/**
 * Fuerza el borrado de una instancia en Evolution API (logout + delete), sin
 * depender de que exista en la BD. De paso, si SÍ existiera un registro en BD con
 * ese nombre, también lo limpia.
 */
export async function forceDeleteEvoInstance(
  input: ForceDeleteInput,
): Promise<{ success: boolean; message: string }> {
  const user = await currentUser()
  if (!user || !isAdminLike(user.role)) return { success: false, message: 'No autorizado.' }

  const instanceName = (input.instanceName || '').trim()
  if (!instanceName) return { success: false, message: 'Indica el nombre de la instancia.' }

  // Resolver credenciales: ApiKey guardado o servidor + key manuales.
  let serverUrl = ''
  let apiKey = ''
  if (input.apiKeyId) {
    const rec = await db.apiKey.findUnique({ where: { id: input.apiKeyId }, select: { url: true, key: true } })
    if (!rec) return { success: false, message: 'El servidor seleccionado ya no existe.' }
    serverUrl = rec.url
    apiKey = rec.key
  } else {
    serverUrl = input.serverUrl || ''
    apiKey = input.apiKey || ''
  }

  const base = normalizeEvoBase(serverUrl)
  if (!base) return { success: false, message: 'Falta la URL del servidor Evolution.' }
  if (!apiKey.trim()) return { success: false, message: 'Falta la API Key del servidor.' }

  const headers = { apikey: apiKey.trim(), 'Content-Type': 'application/json' }
  const name = encodeURIComponent(instanceName)

  try {
    // 1) Logout (best-effort: puede fallar si ya está desconectada).
    await fetch(`${base}/instance/logout/${name}`, { method: 'DELETE', headers }).catch(() => null)

    // 2) Delete (este es el que importa; capturamos su respuesta real).
    const res = await fetch(`${base}/instance/delete/${name}`, { method: 'DELETE', headers })
    const text = await res.text().catch(() => '')

    if (!res.ok) {
      // Extrae un mensaje legible del cuerpo de Evolution (evita el [object Object]).
      let detail = text
      try {
        const j = JSON.parse(text)
        detail = j?.response?.message || j?.message || j?.error || text
        if (Array.isArray(detail)) detail = detail.join(', ')
      } catch { /* texto plano */ }
      // 404 = ya no existe en Evolution: lo tratamos como éxito (objetivo cumplido).
      if (res.status === 404) {
        await cleanDbRow(instanceName)
        return { success: true, message: `La instancia "${instanceName}" ya no existía en Evolution. Limpieza completada.` }
      }
      return { success: false, message: `Evolution respondió ${res.status}: ${detail || 'sin detalle'}` }
    }

    // 3) Limpieza defensiva del registro en BD si por acaso existiera.
    await cleanDbRow(instanceName)
    return { success: true, message: `Instancia "${instanceName}" eliminada de Evolution.` }
  } catch (err: any) {
    return { success: false, message: `No se pudo contactar al servidor: ${err?.message ?? err}` }
  }
}

async function cleanDbRow(instanceName: string) {
  try {
    await db.instancia.deleteMany({ where: { instanceName } })
  } catch { /* no bloquea el resultado */ }
}
