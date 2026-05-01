'use server'

import { db } from '@/lib/db'

export type EvoSlot = 'evo0' | 'evo1' | 'evo2' | 'evo3' | 'evo4' | 'evo5'

const EVO_SLOT_NAMES: EvoSlot[] = ['evo0', 'evo1', 'evo2', 'evo3', 'evo4', 'evo5']

export async function createEvoUrl(userId: string, name: EvoSlot, url: string) {
  try {
    const tool = await db.tool.create({ data: { userId, name, description: url } })
    return { success: true, data: tool }
  } catch (error) {
    console.error('Error al crear URL EVO:', error)
    return { success: false, message: 'No se pudo crear la URL de EVO.' }
  }
}

export async function getEvoUrls(userId: string) {
  try {
    const tools = await db.tool.findMany({
      where: { userId, name: { in: EVO_SLOT_NAMES } },
    })
    return { success: true, data: tools }
  } catch (error) {
    console.error('Error al obtener URLs EVO:', error)
    return { success: false, message: 'No se pudieron cargar las URLs de EVO.' }
  }
}

export async function updateEvoUrl(id: string, name: EvoSlot, url: string) {
  try {
    const tool = await db.tool.update({ where: { id }, data: { name, description: url } })
    return { success: true, data: tool }
  } catch (error) {
    console.error('Error al actualizar URL EVO:', error)
    return { success: false, message: 'No se pudo actualizar la URL de EVO.' }
  }
}

export async function deleteEvoUrl(id: string) {
  try {
    await db.tool.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar URL EVO:', error)
    return { success: false, message: 'No se pudo eliminar la URL de EVO.' }
  }
}
