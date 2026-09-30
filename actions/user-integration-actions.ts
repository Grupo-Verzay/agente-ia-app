'use server'

import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import {
    TOPE_DE_INTEGRACIONES,
    cabeOtra,
    comoListaDeIds,
    comoNombreDeIntegracion,
    comoUrlDeIntegracion,
    yaExisteElNombre,
} from '@/lib/integraciones'

export type UserIntegrationItem = {
    id: string
    name: string
    url: string
    order: number
}

const CAMPOS = { id: true, name: true, url: true, order: true } as const

/**
 * Cómo se contesta un fallo que no se esperaba. Sin esto la acción lanzaba, el
 * `await` de la pantalla se rompía y el botón se quedaba sin respuesta —o, en
 * el caso de reordenar, la lista pintada ya no era la guardada— sin decir por
 * qué. Se escribe con su código de Prisma, que es lo que separa «no se pudo»
 * de «esa columna no existe».
 */
function fallo(donde: string, error: unknown, motivo: string) {
    const codigo = (error as { code?: string } | null)?.code
    console.error(`[integraciones] ${donde}`, { codigo, error })
    return { success: false as const, error: motivo }
}

export async function getUserIntegrations(): Promise<{ success: boolean; data: UserIntegrationItem[] }> {
    const user = await currentUser()
    if (!user) return { success: false, data: [] }

    try {
        const integrations = await db.userIntegration.findMany({
            where: { userId: user.id },
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
            select: CAMPOS,
        })
        return { success: true, data: integrations }
    } catch (error) {
        // La lista la pide el layout de TODAS las pantallas: que falle no puede
        // tumbar la App. Sale vacía, y se dice.
        console.error('[integraciones] no se pudo leer la lista', error)
        return { success: false, data: [] }
    }
}

/**
 * Crea una app. El nombre y la dirección pasan por las mismas reglas que la
 * pantalla (`lib/integraciones.ts`): lo que llega del navegador no se da por
 * bueno. La posición es la siguiente a la última, no el número de filas: con
 * una borrada en medio, contar daría una posición que ya tiene otra.
 */
export async function createUserIntegration(data: { name: string; url: string }) {
    const user = await currentUser()
    if (!user) return { success: false, error: 'No autenticado', item: null }

    const nombre = comoNombreDeIntegracion(data?.name)
    if (!nombre.ok) return { success: false, error: nombre.motivo, item: null }
    const url = comoUrlDeIntegracion(data?.url)
    if (!url.ok) return { success: false, error: url.motivo, item: null }

    try {
        const actuales = await db.userIntegration.findMany({
            where: { userId: user.id },
            select: { id: true, name: true, order: true },
        })
        if (!cabeOtra(actuales.length)) {
            return {
                success: false,
                error: `Ya tienes ${TOPE_DE_INTEGRACIONES} apps, que es el máximo. Borra una para agregar otra.`,
                item: null,
            }
        }
        if (yaExisteElNombre(actuales, nombre.valor)) {
            return { success: false, error: `Ya tienes una app llamada «${nombre.valor}». Ponle otro nombre.`, item: null }
        }
        const siguiente = actuales.reduce((max, i) => Math.max(max, i.order + 1), 0)
        const item = await db.userIntegration.create({
            data: { userId: user.id, name: nombre.valor, url: url.valor, order: siguiente },
            select: CAMPOS,
        })
        revalidatePath('/integraciones')
        return { success: true, item }
    } catch (error) {
        return { ...fallo('no se pudo crear', error, 'No se pudo guardar la app. Inténtalo de nuevo.'), item: null }
    }
}

export async function updateUserIntegration(id: string, data: { name?: string; url?: string }) {
    const user = await currentUser()
    if (!user) return { success: false, error: 'No autenticado' }
    if (typeof id !== 'string' || !id) return { success: false, error: 'Esa app ya no existe.' }

    const cambios: { name?: string; url?: string } = {}
    if (data?.name !== undefined) {
        const nombre = comoNombreDeIntegracion(data.name)
        if (!nombre.ok) return { success: false, error: nombre.motivo }
        cambios.name = nombre.valor
    }
    if (data?.url !== undefined) {
        const url = comoUrlDeIntegracion(data.url)
        if (!url.ok) return { success: false, error: url.motivo }
        cambios.url = url.valor
    }

    try {
        if (cambios.name !== undefined) {
            const actuales = await db.userIntegration.findMany({
                where: { userId: user.id },
                select: { id: true, name: true },
            })
            if (yaExisteElNombre(actuales, cambios.name, id)) {
                return { success: false, error: `Ya tienes otra app llamada «${cambios.name}». Ponle otro nombre.` }
            }
        }
        // `updateMany` y su cuenta, no `update`: con `update` una fila que ya no
        // está —la borró otra pestaña— lanza, y eso se veía como un botón roto.
        const { count } = await db.userIntegration.updateMany({
            where: { id, userId: user.id },
            data: cambios,
        })
        if (count === 0) return { success: false, error: 'Esa app ya no existe. Recarga la pantalla.' }
        revalidatePath('/integraciones')
        return { success: true, name: cambios.name, url: cambios.url }
    } catch (error) {
        return fallo('no se pudo editar', error, 'No se pudo guardar el cambio. Inténtalo de nuevo.')
    }
}

export async function deleteUserIntegration(id: string) {
    const user = await currentUser()
    if (!user) return { success: false, error: 'No autenticado' }
    if (typeof id !== 'string' || !id) return { success: false, error: 'Esa app ya no existe.' }

    try {
        // Una que ya no está (la borró otra pestaña) cuenta como borrada: lo que
        // se quería es que no esté, y no está.
        await db.userIntegration.deleteMany({ where: { id, userId: user.id } })
        revalidatePath('/integraciones')
        return { success: true }
    } catch (error) {
        return fallo('no se pudo borrar', error, 'No se pudo eliminar la app. Inténtalo de nuevo.')
    }
}

/**
 * Guarda el orden de la lista ENTERA, en una transacción: a medias quedarían
 * dos filas en la misma posición y el orden de las pestañas de Chats no sería
 * ni el de antes ni el nuevo. Un id que no es de esta cuenta no toca nada
 * (`updateMany` con la cuenta en el `where`).
 */
export async function reorderUserIntegrations(ids: string[]) {
    const user = await currentUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const lista = comoListaDeIds(ids)
    if (lista.length === 0) return { success: true }

    try {
        await db.$transaction(
            lista.map((id, index) =>
                db.userIntegration.updateMany({
                    where: { id, userId: user.id },
                    data: { order: index },
                }),
            ),
        )
        revalidatePath('/integraciones')
        return { success: true }
    } catch (error) {
        return fallo('no se pudo reordenar', error, 'No se pudo guardar el orden. Se deja como estaba.')
    }
}
