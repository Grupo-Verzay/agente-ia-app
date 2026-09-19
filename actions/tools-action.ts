'use server'

import { Tools } from '@/app/(root)/(protected)/admin/clientes/tool-types'
import { db } from '@/lib/db'
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion'

/**
 * Sin guarda ninguna: el `userId` llegaba del navegador y entraba directo al
 * `data` y al `where`. Es el H02 de siempre, y aquí lo que se abre son las
 * herramientas del agente de otra cuenta.
 *
 * Y las dos de abajo iban con `where: { id }` pelado —**un `where` sin dueño es
 * el mismo hueco sin el id delante**—, así que el dueño se lee de la fila y se
 * comprueba: no sale del navegador.
 */

export async function createTool(userId: string, name: Tools, description: string) {
  try {
    const cuenta = await laCuentaDeLaAccion(userId)
    if (!cuenta) return { success: false, message: 'No autorizado.' }

    const tool = await db.tool.create({
      data: { userId: cuenta, name, description },
    })
    return { success: true, data: tool }
  } catch (error) {
    console.error('Error al crear herramienta:', error)
    return { success: false, message: 'No se pudo crear la herramienta.' }
  }
}

export async function getTools(userId: string) {
  try {
    const cuenta = await laCuentaDeLaAccion(userId)
    if (!cuenta) return { success: false, message: 'No autorizado.' }

    const tool = await db.tool.findMany({ where: { userId: cuenta } })
    return { success: true, data: tool }
  } catch (error) {
    console.error('Error al obtener herramientas:', error)
    return { success: false, message: 'No se pudieron cargar las herramientas.' }
  }
}

export async function updateTool(id: string, name: Tools, description: string) {
  try {
    const suyo = await db.tool.findUnique({ where: { id }, select: { userId: true } })
    if (!suyo || !(await laCuentaDeLaAccion(suyo.userId))) {
      return { success: false, message: 'No autorizado.' }
    }

    const tool = await db.tool.update({
      where: { id },
      data: { name, description },
    })
    return { success: true, data: tool }
  } catch (error) {
    console.error('Error al actualizar herramienta:', error)
    return { success: false, message: 'No se pudo actualizar la herramienta.' }
  }
}

export async function deleteTool(id: string) {
  try {
    const suyo = await db.tool.findUnique({ where: { id }, select: { userId: true } })
    if (!suyo || !(await laCuentaDeLaAccion(suyo.userId))) {
      return { success: false, message: 'No autorizado.' }
    }

    await db.tool.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar herramienta:', error)
    return { success: false, message: 'No se pudo eliminar la herramienta.' }
  }
}
