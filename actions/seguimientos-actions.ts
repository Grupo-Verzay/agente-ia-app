// app/actions/seguimiento-actions.ts
'use server'

import { db } from "@/lib/db"
import { seguimientosSchema } from "@/schema/seguimientos"

export interface SeguimientosResponse {
  success: boolean
  message: string
  data?: any
}

export const createSeguimiento = async (input: unknown) => {
  const validated = seguimientosSchema.safeParse(input)

  if (!validated.success) {
    return {
      success: false,
      message: "Datos inválidos",
      error: validated.error.flatten(),
    }
  }

  try {
    const seguimiento = await db.seguimiento.create({
      data: validated.data,
    })

    return {
      success: true,
      message: "Seguimiento creado correctamente",
      data: seguimiento,
    }
  } catch (error) {
    console.error("Error al crear seguimiento:", error)
    return {
      success: false,
      message: "Ocurrió un error al guardar el seguimiento",
    }
  }
}


/**
 * 1) Eliminar TODOS los recordatorios asociados a un instanceName
 */
export async function deleteSeguimientosByInstanceName(userId: string): Promise<SeguimientosResponse> {
  if (!userId) {
    return {
      success: false,
      message: "El userId es obligatorio.",
    }
  }

  try {
    // Buscar la instancia del usuario con instanceType = "Whatsapp"
    const instancia = await db.instancia.findMany({
      where: {
        userId,
        instanceType: "Whatsapp",
      },
      orderBy: {
        id: "desc", // por si tiene varias, toma la más reciente
      },
    })

    if (!instancia.length) {
      return {
        success: false,
        message: "No se encontró ninguna instancia Whatsapp para este usuario.",
      }
    }

    const posiblesInstancias = [
      ...instancia.map(i => i.instanceName),
      ...instancia.map(i => i.instanceId),
    ]

    const result = await db.seguimiento.deleteMany({
      where: {
        instancia: { in: posiblesInstancias },
      },
    })

    return {
      success: true,
      message:
        result.count > 0
          ? `Se eliminaron ${result.count} seguimiento.`
          : "No se encontraron seguimiento para esa instancia.",
      data: {
        count: result.count,
        instanceNames: instancia.map(i => i.instanceName),
      },
    }
  } catch (error) {
    console.error("[DELETE_REMINDERS_BY_INSTANCE_NAME]", error)
    return {
      success: false,
      message: "Error al eliminar los recordatorios por instancia del usuario.",
    }
  }
}

/**
 * 2) Eliminar SOLO el/los recordatorio(s) que coincidan con:
 *    instanceName && userId && remoteJid
 */
export async function deleteReminderByInstanceUserRemote(
  instanceName: string,
  userId: string,
  remoteJid: string
): Promise<SeguimientosResponse> {
  if (!instanceName || !userId || !remoteJid) {
    return {
      success: false,
      message: "instanceName, userId y remoteJid son obligatorios.",
    }
  }

  try {
    // 1) Verificar que esa instancia pertenezca a ese userId
    const instancia = await db.instancia.findFirst({
      where: {
        userId,
        instanceName,
        instanceType: "Whatsapp",
      },
    })

    if (!instancia) {
      return {
        success: false,
        message: "No se encontró una instancia Whatsapp con ese nombre para este usuario.",
      }
    }

    // 2) Eliminar seguimiento SOLO de esa instancia y ese remoteJid
    const result = await db.seguimiento.deleteMany({
      where: {
        instancia: instancia.instanceName,
        remoteJid,
      },
    })

    return {
      success: true,
      message:
        result.count > 0
          ? `seguimiento(s) eliminado(s) correctamente. Total: ${result.count}.`
          : "No se encontró ningún recordatorio con esos datos.",
      data: { count: result.count },
    }
  } catch (error) {
    console.error("[DELETE_REMINDER_BY_INSTANCE_USER_REMOTE]", error)
    return {
      success: false,
      message: "Error al eliminar el recordatorio por instanceName, userId y remoteJid.",
    }
  }
}
