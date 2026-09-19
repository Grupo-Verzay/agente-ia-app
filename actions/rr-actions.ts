'use server';

import { db } from '@/lib/db';
import { QuickReply } from '@prisma/client';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';

interface RROperationResponse {
    success: boolean;
    message: string;
    data?: QuickReply[];
}

/**
 * Sin guarda ninguna: el `userId` llegaba del navegador y entraba directo al
 * `where` y al `create`. Es el H02 de siempre.
 *
 * Aquí están además **los dos casos que un barrido por la firma no ve**:
 *
 * - `createRR` lo recibe **dentro de un objeto**, así que buscar `userId:
 *   string` en la firma no lo encuentra.
 * - `updateRR` recibe un `Partial<QuickReply>` entero, o sea que el navegador
 *   podía mandar `userId` dentro del `data` y **mudar la respuesta a otra
 *   cuenta**. Es la misma familia que el `assignNonBooleanFields` de Clientes:
 *   la identidad de la fila —quién es y de quién cuelga— no se copia de lo que
 *   llegue de fuera.
 */

/** El dueño sale de la FILA, no del navegador. */
async function laCuentaDeLaRespuesta(id: number) {
    const suya = await db.quickReply.findUnique({ where: { id }, select: { userId: true } });
    if (!suya?.userId) return null;
    return laCuentaDeLaAccion(suya.userId);
}

export async function getAllRRs(userId: string): Promise<RROperationResponse> {
    try {
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        const list = await db.quickReply.findMany({
            where: { userId: cuenta },
            orderBy: { order: 'asc' },
        });
        return {
            success: true,
            message: 'Registros obtenidos correctamente.',
            data: list,
        };
    } catch (error) {
        console.error('Error al obtener registros rr:', error);
        return {
            success: false,
            message: 'Error al obtener los registros.',
        };
    }
}

export async function getAllRRsByUserIds(userIds: string[]): Promise<RROperationResponse> {
    if (!userIds.length) return { success: true, message: 'Sin usuarios.', data: [] };
    try {
        // Una lista que llega de fuera no decide a qué cuentas se llega: se
        // **filtra**, no se rechaza entera. Esto lo llama la precarga de Chats
        // con las líneas que ya resolvió el servidor, así que en el caso normal
        // no se cae ninguna; lo que se cierra es pedirla a mano con otros ids.
        const alcanzadas: string[] = [];
        for (const pedido of userIds) {
            const cuenta = await laCuentaDeLaAccion(pedido);
            if (cuenta) alcanzadas.push(cuenta);
        }
        if (!alcanzadas.length) return { success: true, message: 'Sin usuarios.', data: [] };

        const list = await db.quickReply.findMany({
            where: { userId: { in: alcanzadas } },
            orderBy: [{ userId: 'asc' }, { order: 'asc' }],
        });
        return {
            success: true,
            message: 'Registros obtenidos correctamente.',
            data: list,
        };
    } catch (error) {
        console.error('Error al obtener registros rr:', error);
        return {
            success: false,
            message: 'Error al obtener los registros.',
        };
    }
}

export async function createRR(data: {
    workflowId?: string;
    name?: string;
    mensaje?: string;
    category?: string;
    userId: string;
}): Promise<RROperationResponse> {
    try {
        const cuenta = await laCuentaDeLaAccion(data.userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        await db.quickReply.create({ data: { ...data, userId: cuenta } });
        return {
            success: true,
            message: 'Registro creado correctamente.',
        };
    } catch (error) {
        console.error('Error al crear rr:', error);
        return {
            success: false,
            message: 'Error al crear el registro.',
        };
    }
}

export async function getAllRRsByWorkflowId(workflowId: string): Promise<RROperationResponse> {
    try {
        const list = await db.quickReply.findMany({
            where: { workflowId },
            orderBy: { createdAt: 'desc' },
        });
        // El flujo no dice de quién es, así que se acota por las filas: se
        // devuelven solo las de cuentas que esta persona alcanza.
        const suyas: QuickReply[] = [];
        for (const fila of list) {
            if (fila.userId && (await laCuentaDeLaAccion(fila.userId))) suyas.push(fila);
        }
        return {
            success: true,
            message: 'Registros obtenidos correctamente.',
            data: suyas,
        };
    } catch (error) {
        console.error('Error al obtener registros rr:', error);
        return {
            success: false,
            message: 'Error al obtener los registros.',
        };
    }
}

export async function updateRR(id: number, data: Partial<QuickReply>): Promise<RROperationResponse> {
    try {
        if (!(await laCuentaDeLaRespuesta(id))) {
            return { success: false, message: 'No autorizado.' };
        }

        // La identidad de la fila no se copia de lo que llegue del navegador.
        const { id: _id, userId: _userId, createdAt: _createdAt, ...cambios } = data;

        await db.quickReply.update({
            where: { id },
            data: cambios,
        });
        return {
            success: true,
            message: 'Registro actualizado correctamente.',
        };
    } catch (error) {
        console.error('Error al actualizar rr:', error);
        return {
            success: false,
            message: 'Error al actualizar el registro.',
        };
    }
}

export async function deleteRR(id: number): Promise<RROperationResponse> {
    try {
        if (!(await laCuentaDeLaRespuesta(id))) {
            return { success: false, message: 'No autorizado.' };
        }

        await db.quickReply.delete({ where: { id } });
        return {
            success: true,
            message: 'Registro eliminado correctamente.',
        };
    } catch (error) {
        console.error('Error al eliminar rr:', error);
        return {
            success: false,
            message: 'Error al eliminar el registro.',
        };
    }
}

export async function updateRROrder(id: number, order: number): Promise<RROperationResponse> {
    try {
        if (!(await laCuentaDeLaRespuesta(id))) {
            return { success: false, message: 'No autorizado.' };
        }

        await db.quickReply.update({
            where: { id },
            data: { order },
        });
        return {
            success: true,
            message: 'Orden actualizado correctamente.',
        };
    } catch (error) {
        console.error('Error al actualizar orden rr:', error);
        return {
            success: false,
            message: 'Error al actualizar el orden.',
        };
    }
}
