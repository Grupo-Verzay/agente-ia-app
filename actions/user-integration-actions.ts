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
    if (!user) return { success: false, error: 'No autenticado', item: null }

    const count = await db.userIntegration.count({ where: { userId: user.id } })
    const item = await db.userIntegration.create({
        data: { userId: user.id, name: data.name, url: data.url, order: count },
        select: { id: true, name: true, url: true, order: true },
    })
    revalidatePath('/integraciones')
    return { success: true, item }
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

export async function reorderUserIntegrations(ids: string[]) {
    const user = await currentUser()
    if (!user) return { success: false }

    await Promise.all(
        ids.map((id, index) =>
            db.userIntegration.update({
                where: { id, userId: user.id },
                data: { order: index },
            })
        )
    )
    revalidatePath('/integraciones')
    return { success: true }
}
