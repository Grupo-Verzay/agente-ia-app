'use server'

import { Tools } from '@/app/(root)/(protected)/admin/clientes/tool-types'
import { db } from '@/lib/db'

export async function createTool(userId: string, name: Tools, description: string) {
  try {
    const tool = await db.tool.create({
      data: { userId, name, description },
    })
    return { success: true, data: tool }
  } catch (error) {
    console.error('Error al crear herramienta:', error)
    return { success: false, message: 'No se pudo crear la herramienta.' }
  }
}

export async function getTools(userId: string) {
  try {
    const tool = await db.tool.findMany({ where: { userId } })
    return { success: true, data: tool }
  } catch (error) {
    console.error('Error al obtener herramientas:', error)
    return { success: false, message: 'No se pudieron cargar las herramientas.' }
  }
}

export async function updateTool(id: string, name: Tools, description: string) {
  try {
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
    await db.tool.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar herramienta:', error)
    return { success: false, message: 'No se pudo eliminar la herramienta.' }
  }
}
