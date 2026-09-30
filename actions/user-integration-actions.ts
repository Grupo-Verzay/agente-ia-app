'use server'

import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { comoUrlDeIntegracion, MOTIVO_URL_NO_VALIDA } from '@/lib/url-embebible'

/** Tope del nombre de una pestaña: es un rótulo, no un texto. */
const TOPE_DEL_NOMBRE = 60

/**
 * Lo que se guarda de una integración, saneado: un nombre y una dirección
 * `http(s)`. La dirección se pinta como `<iframe>` en Chats y como enlace en
 * Integraciones, así que una con `javascript:` sería código corriendo en la
 * plataforma con la sesión de quien la abra (ver `lib/url-embebible.ts`).
 */
function comoIntegracion(data: { name?: unknown; url?: unknown }, parcial: boolean):
    | { ok: true; datos: { name?: string; url?: string } }
    | { ok: false; error: string } {
    const datos: { name?: string; url?: string } = {}
    if (data.name !== undefined || !parcial) {
        const name = typeof data.name === 'string' ? data.name.trim().slice(0, TOPE_DEL_NOMBRE) : ''
        if (!name) return { ok: false, error: 'Falta el nombre.' }
        datos.name = name
    }
    if (data.url !== undefined || !parcial) {
        const url = comoUrlDeIntegracion(data.url)
        if (!url) return { ok: false, error: MOTIVO_URL_NO_VALIDA }
        datos.url = url
    }
    return { ok: true, datos }
}

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

    const saneada = comoIntegracion(data, false)
    if (!saneada.ok) return { success: false, error: saneada.error, item: null }
    const { name, url } = saneada.datos as { name: string; url: string }

    const count = await db.userIntegration.count({ where: { userId: user.id } })
    const item = await db.userIntegration.create({
        data: { userId: user.id, name, url, order: count },
        select: { id: true, name: true, url: true, order: true },
    })
    revalidatePath('/integraciones')
    return { success: true, item }
}

export async function updateUserIntegration(id: string, data: { name?: string; url?: string }) {
    const user = await currentUser()
    if (!user) return { success: false, error: 'No autenticado' }

    // Solo el nombre y la dirección: el cuerpo llega del navegador, y pasado
    // tal cual a Prisma dejaba cambiar `userId` u `order` a mano.
    const saneada = comoIntegracion(data, true)
    if (!saneada.ok) return { success: false, error: saneada.error }

    await db.userIntegration.update({
        where: { id, userId: user.id },
        data: saneada.datos,
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
