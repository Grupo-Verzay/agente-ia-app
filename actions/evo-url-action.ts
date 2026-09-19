'use server'

import { db } from '@/lib/db'
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion'

export type EvoSlot = 'evo0' | 'evo1' | 'evo2' | 'evo3' | 'evo4' | 'evo5'

const EVO_SLOT_NAMES: EvoSlot[] = ['evo0', 'evo1', 'evo2', 'evo3', 'evo4', 'evo5']

/**
 * Este fichero no tenía **ni una** llamada a `currentUser()`: el `userId` llegaba
 * del navegador y entraba directo al `data` y al `where`. Es el H02 de siempre.
 *
 * Y las dos de abajo son el otro hueco que describe la regla: **un `where` sin
 * dueño es el mismo hueco sin el id delante**. No reciben cuenta ninguna, así
 * que el dueño **sale de la fila** —un `findUnique` pequeño— y se comprueba;
 * sin eso se edita y se borra la URL de cualquiera con solo acertar el id.
 */

export async function createEvoUrl(userId: string, name: EvoSlot, url: string) {
  try {
    const cuenta = await laCuentaDeLaAccion(userId)
    if (!cuenta) return { success: false, message: 'No autorizado.' }

    const tool = await db.tool.create({ data: { userId: cuenta, name, description: url } })
    return { success: true, data: tool }
  } catch (error) {
    console.error('Error al crear URL EVO:', error)
    return { success: false, message: 'No se pudo crear la URL de EVO.' }
  }
}

export async function getEvoUrls(userId: string) {
  try {
    const cuenta = await laCuentaDeLaAccion(userId)
    if (!cuenta) return { success: false, message: 'No autorizado.' }

    const tools = await db.tool.findMany({
      where: { userId: cuenta, name: { in: EVO_SLOT_NAMES } },
    })
    return { success: true, data: tools }
  } catch (error) {
    console.error('Error al obtener URLs EVO:', error)
    return { success: false, message: 'No se pudieron cargar las URLs de EVO.' }
  }
}

export async function updateEvoUrl(id: string, name: EvoSlot, url: string) {
  try {
    const suyo = await db.tool.findUnique({ where: { id }, select: { userId: true } })
    if (!suyo || !(await laCuentaDeLaAccion(suyo.userId))) {
      return { success: false, message: 'No autorizado.' }
    }

    const tool = await db.tool.update({ where: { id }, data: { name, description: url } })
    return { success: true, data: tool }
  } catch (error) {
    console.error('Error al actualizar URL EVO:', error)
    return { success: false, message: 'No se pudo actualizar la URL de EVO.' }
  }
}

export async function deleteEvoUrl(id: string) {
  try {
    const suyo = await db.tool.findUnique({ where: { id }, select: { userId: true } })
    if (!suyo || !(await laCuentaDeLaAccion(suyo.userId))) {
      return { success: false, message: 'No autorizado.' }
    }

    await db.tool.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar URL EVO:', error)
    return { success: false, message: 'No se pudo eliminar la URL de EVO.' }
  }
}
