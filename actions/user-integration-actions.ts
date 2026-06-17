'use server'

import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export type UserIntegrationItem = {
    id: string
    name: string
    url: string
    order: number
}

export async function getUserIntegrations(): Promise<{ success: boolean; data: UserIntegrationItem[] }> {
    const user = await currentUser()
    if (!user) return { success: false, data: [] }

    const integrations = await db.userIntegration.findMany({
        where: { userId: user.id },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, url: true, order: true },
    })
    return { success: true, data: integrations }
}

export async function createUserIntegration(data: { name: string; url: string }) {
    const user = await currentUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const count = await db.userIntegration.count({ where: { userId: user.id } })
    await db.userIntegration.create({
        data: { userId: user.id, name: data.name, url: data.url, order: count },
    })
    revalidatePath('/integraciones')
    return { success: true }
}

export async function updateUserIntegration(id: string, data: { name?: string; url?: string }) {
    const user = await currentUser()
    if (!user) return { success: false, error: 'No autenticado' }

    await db.userIntegration.update({
        where: { id, userId: user.id },
        data,
    })
    revalidatePath('/integraciones')
    return { success: true }
}

export async function deleteUserIntegration(id: string) {
    const user = await currentUser()
    if (!user) return { success: false, error: 'No autenticado' }

    await db.userIntegration.delete({
        where: { id, userId: user.id },
    })
    revalidatePath('/integraciones')
    return { success: true }
}
