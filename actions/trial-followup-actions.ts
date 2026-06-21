'use server'

import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { isAdmin } from '@/lib/rbac'

export interface TrialFollowUpConfigData {
  enabled: boolean
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

  await db.trialFollowUpConfig.upsert({
    where: { resellerId: targetId },
    update: {
      enabled: data.enabled,
      instanceName: data.instanceName || null,
      message1: data.message1 || null,
      message3: data.message3 || null,
      message6: data.message6 || null,
    },
    create: {
      resellerId: targetId,
      enabled: data.enabled,
      instanceName: data.instanceName || null,
      message1: data.message1 || null,
      message3: data.message3 || null,
      message6: data.message6 || null,
    },
  })

  return { success: true, message: 'Configuración guardada' }
}

export async function getDefaultMessages() {
  return DEFAULT_MESSAGES
}
