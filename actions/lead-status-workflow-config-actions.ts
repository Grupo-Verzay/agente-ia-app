'use server'

import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import type { LeadStatus, Workflow } from '@prisma/client'

export type LeadStatusWorkflowConfigItem = {
  id: string
  leadStatus: LeadStatus
  workflowId: string
  workflow: Pick<Workflow, 'id' | 'name'>
}

export async function getLeadStatusWorkflowConfigs(): Promise<{
  success: boolean
  data: LeadStatusWorkflowConfigItem[]
}> {
  const user = await currentUser()
  if (!user) return { success: false, data: [] }
  const userId = user.ownerId ?? user.id

  try {
    const data = await db.leadStatusWorkflowConfig.findMany({
      where: { userId },
      include: { workflow: { select: { id: true, name: true } } },
      orderBy: { leadStatus: 'asc' },
    })
    return { success: true, data }
  } catch {
    return { success: false, data: [] }
  }
}

export async function upsertLeadStatusWorkflowConfig(
  leadStatus: LeadStatus,
  workflowId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await currentUser()
  if (!user) return { success: false, error: 'No autorizado.' }
  const userId = user.ownerId ?? user.id

  try {
    await db.leadStatusWorkflowConfig.upsert({
      where: { userId_leadStatus: { userId, leadStatus } },
      create: { userId, leadStatus, workflowId },
      update: { workflowId },
    })
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo guardar la configuración.' }
  }
}

export async function deleteLeadStatusWorkflowConfig(
  leadStatus: LeadStatus,
): Promise<{ success: boolean; error?: string }> {
  const user = await currentUser()
  if (!user) return { success: false, error: 'No autorizado.' }
  const userId = user.ownerId ?? user.id

  try {
    await db.leadStatusWorkflowConfig.deleteMany({
      where: { userId, leadStatus },
    })
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo eliminar la configuración.' }
  }
}
